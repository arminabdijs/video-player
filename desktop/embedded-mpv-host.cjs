'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { MessageChannelMain } = require('electron');
const { parseNativeStatus } = require('./native-status.cjs');
const { waitForChildExit, shouldReportProcessExit } = require('./process-lifecycle.cjs');

const FRAME_HEADER_BYTES = 24;
const FRAME_MAGIC = 0x41525541;
const MAX_FRAME_BYTES = 256 * 1024 * 1024;
const MAX_RENDER_WIDTH = 3840;
const MAX_RENDER_HEIGHT = 2160;
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const MAX_THUMBNAIL_CACHE_ENTRIES = 500;

function parseThumbnailFrame(output) {
  if (!Buffer.isBuffer(output) || output.length < FRAME_HEADER_BYTES) {
    throw new Error('موتور هیچ فریم معتبری برای تصویر بندانگشتی تولید نکرد.');
  }
  const magic = output.readUInt32LE(0);
  const width = output.readUInt32LE(4);
  const height = output.readUInt32LE(8);
  const stride = output.readUInt32LE(12);
  const pixelBytes = output.readUInt32LE(16);
  if (magic !== FRAME_MAGIC || width < 1 || width > 640 || height < 1 || height > 360 ||
      stride !== width * 4 || pixelBytes !== stride * height || pixelBytes > MAX_THUMBNAIL_BYTES ||
      output.length !== FRAME_HEADER_BYTES + pixelBytes) {
    throw new Error('ساختار فریم تصویر بندانگشتی معتبر نیست.');
  }
  return { width, height, data: output.subarray(FRAME_HEADER_BYTES).toString('base64') };
}

class EmbeddedMpvHost {
  constructor({ app, window, assertTrustedRenderer }) {
    this.app = app;
    this.window = window;
    if (typeof assertTrustedRenderer !== 'function') {
      throw new TypeError('Embedded MPV requires a renderer assertion callback.');
    }
    this.assertTrustedRenderer = assertTrustedRenderer;
    this.child = null;
    this.port = null;
    // Attach renderer ports only after the window preload is ready.
    this.frameWindows = new Map();
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    this.latestFrame = null;
    this.awaitingAck = false;
    this.sequence = 0;
    this.awaitingSequence = 0;
    this.frameSentAtNs = 0n;
    this.frameAckStatsStartedAt = Date.now();
    this.frameAckSamples = 0;
    this.frameAckTotalMs = 0;
    this.frameAckMaxMs = 0;
    this.stderrBuffer = '';
    this.lastEngineError = '';
    this.stopping = false;
    this.thumbnailPromises = new Map();
    this.thumbnailWriteCount = 0;
    this.frameOutputEnabled = true;
    this.sessionSequence = 0;
    this.activeSession = null;
    this.stopPromise = null;
    this.startQueue = Promise.resolve();
    this.prewarmPromise = null;
  }

  resolveHelperPath() {
    const base = this.app.isPackaged
      ? path.join(process.resourcesPath, 'native')
      : path.join(this.app.getAppPath(), 'native', 'dist');
    const executable = process.platform === 'win32' ? 'aura-mpv-frame-host.exe' : 'aura-mpv-frame-host';
    const candidate = path.join(base, executable);
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      throw new Error(
        `موتور داخلی پخش همراه برنامه پیدا نشد: ${candidate}. ` +
        'بستهٔ نصب باید شامل native/aura-mpv-frame-host و کتابخانه‌های libmpv باشد.'
      );
    }
    return { executable: candidate, runtimeDirectory: base };
  }

  assertRenderer(event) {
    // This dependency is an assertion: it throws on an untrusted sender and
    // intentionally returns undefined on success. Do not treat its return
    // value as a boolean predicate.
    this.assertTrustedRenderer(event);
  }

  setFrameOutputEnabled(enabled) {
    this.frameOutputEnabled = Boolean(enabled);
    if (!this.child || this.child.killed || !this.child.stdin.writable) return false;
    try {
      this.child.stdin.write(`frames-enabled ${this.frameOutputEnabled ? 1 : 0}\n`);
      return true;
    } catch (error) {
      console.warn('[Aura Player] Could not update native frame-output state:', error?.message || error);
      return false;
    }
  }

  attachFrameTarget(id, targetWindow) {
    if (typeof id !== 'string' || !id || !targetWindow) {
      throw new TypeError('A named, live frame target window is required.');
    }
    this.frameWindows.set(id, targetWindow);
    if (!this.activeSession) return false;
    return this.attachSessionFramePort(this.activeSession, id, targetWindow);
  }

  detachFrameTarget(id) {
    this.frameWindows.delete(id);
    const session = this.activeSession;
    const target = session?.ports.get(id);
    if (!target) return false;

    session.ports.delete(id);
    if (this.port === target.port) this.port = session.ports.get('main')?.port || null;
    try { target.port.close(); } catch { /* already closed */ }

    if (session.pendingFrameAcks.delete(id) && this.awaitingAck && session.pendingFrameAcks.size === 0) {
      this.acknowledgeFrame(session);
    }
    return true;
  }

  attachSessionFramePort(session, id, targetWindow) {
    if (!session || this.activeSession !== session ||
        targetWindow.isDestroyed?.() || targetWindow.webContents?.isDestroyed?.()) return false;

    const existing = session.ports.get(id);
    if (existing) {
      try { existing.port.close(); } catch { /* already closed */ }
      session.ports.delete(id);
      session.pendingFrameAcks.delete(id);
    }

    const { port1, port2 } = new MessageChannelMain();
    const target = { window: targetWindow, port: port2 };
    session.ports.set(id, target);
    if (id === 'main') this.port = port2;

    port2.on('message', (messageEvent) => {
      if (this.activeSession !== session || session.ports.get(id) !== target) return;
      const message = messageEvent.data;
      if (message?.type !== 'ack' || Number(message.sequence) !== this.awaitingSequence) return;
      if (!session.pendingFrameAcks.delete(id)) return;
      if (session.pendingFrameAcks.size === 0) this.acknowledgeFrame(session);
    });
    port2.start();
    targetWindow.webContents.postMessage('aura:embedded-mpv-channel', null, [port1]);
    return true;
  }

  prewarm(requestedSize = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    if (this.activeSession?.isWarmup && this.activeSession.child && !this.activeSession.child.killed) {
      return this.waitForSessionReady(this.activeSession).then(() => ({ started: true, prewarmed: true }));
    }

    const operation = this.startQueue.then(
      () => this.startSession(null, null, 0, requestedSize, true),
      () => this.startSession(null, null, 0, requestedSize, true),
    );
    this.startQueue = operation.catch(() => {});
    this.prewarmPromise = operation.catch((error) => {
      this.prewarmPromise = null;
      throw error;
    });
    return this.prewarmPromise;
  }

  waitForSessionReady(session, timeoutMs = 15_000) {
    if (!session) return Promise.reject(new Error('Native warmup session is unavailable.'));
    if (session.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('آماده‌سازی اولیه موتور پخش بیش از حد طول کشید.')), timeoutMs);
      session.readyPromise.then(() => {
        clearTimeout(timeout);
        resolve();
      }, (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  start(event, filePath, requestedStartTime = 0, requestedSize = {}) {
    const operation = this.startQueue.then(
      () => this.startSession(event, filePath, requestedStartTime, requestedSize),
      () => this.startSession(event, filePath, requestedStartTime, requestedSize),
    );
    this.startQueue = operation.catch(() => {});
    return operation;
  }

  async startSession(event, filePath, requestedStartTime = 0, requestedSize = {}, warmup = false) {
    if (event) this.assertRenderer(event);
    if (!warmup && (typeof filePath !== 'string' || !path.isAbsolute(filePath))) {
      throw new TypeError('The media path must be an absolute local path.');
    }
    if (!warmup) {
      const info = await fs.promises.stat(filePath).catch(() => null);
      if (!info?.isFile()) throw new Error('فایل انتخاب‌شده دیگر وجود ندارد یا فایل معتبر نیست.');

      const existing = this.activeSession;
      if (existing?.isWarmup && existing.child && !existing.child.killed) {
        try {
          await this.waitForSessionReady(existing);
          if (this.activeSession === existing && existing.child && !existing.child.killed) {
            return this.loadIntoWarmSession(existing, filePath, requestedStartTime, requestedSize);
          }
        } catch (error) {
          console.warn('[Aura Player] Warmup did not become ready; starting the playback engine on demand:', error?.message || error);
          await this.stop();
        }
      }
    }

    await this.stop();
    const { executable, runtimeDirectory } = this.resolveHelperPath();
    const startTime = Number.isFinite(Number(requestedStartTime))
      ? Math.max(0, Math.min(Number(requestedStartTime), 7 * 24 * 60 * 60))
      : 0;
    // Warmup allocates only a small initial FBO. The requested viewport size
    // is sent again before the real file is loaded.
    const width = warmup ? 640 : Math.max(480, Math.min(MAX_RENDER_WIDTH, Math.round(Number(requestedSize.width) || 1920)));
    const height = warmup ? 360 : Math.max(270, Math.min(MAX_RENDER_HEIGHT, Math.round(Number(requestedSize.height) || 1080)));

    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    this.latestFrame = null;
    this.awaitingAck = false;
    this.awaitingSequence = 0;
    this.frameSentAtNs = 0n;
    this.frameAckStatsStartedAt = Date.now();
    this.frameAckSamples = 0;
    this.frameAckTotalMs = 0;
    this.frameAckMaxMs = 0;
    this.stderrBuffer = '';
    this.lastEngineError = '';
    this.stopping = false;
    this.thumbnailPromises = new Map();
    this.thumbnailWriteCount = 0;

    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    readyPromise.catch(() => {});
    const session = {
      id: ++this.sessionSequence,
      port: null,
      ports: new Map(),
      pendingFrameAcks: new Set(),
      child: null,
      stopRequested: false,
      isWarmup: warmup,
      ready: false,
      readyPromise,
      resolveReady,
      rejectReady,
    };
    this.activeSession = session;
    this.port = null;
    for (const [targetId, targetWindow] of this.frameWindows) {
      this.attachSessionFramePort(session, targetId, targetWindow);
    }
    session.port = this.port;

    const env = { ...process.env };
    const libraryDirectory = path.join(runtimeDirectory, 'lib');
    if (process.platform === 'win32') {
      env.PATH = `${runtimeDirectory}${path.delimiter}${env.PATH || ''}`;
    } else if (fs.existsSync(libraryDirectory)) {
      env.LD_LIBRARY_PATH = `${libraryDirectory}${path.delimiter}${env.LD_LIBRARY_PATH || ''}`;
    }

    const argumentsList = warmup
      ? ['--warmup', '--width', String(width), '--height', String(height)]
      : ['--file', filePath, '--start', String(startTime), '--width', String(width), '--height', String(height)];
    const child = spawn(executable, argumentsList, {
      cwd: runtimeDirectory,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    session.child = child;
    this.child = child;
    if (!this.frameOutputEnabled && child.stdin.writable) child.stdin.write('frames-enabled 0\n');

    child.stdout.on('data', (chunk) => {
      if (this.activeSession === session) this.consumeFrames(chunk);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      if (this.activeSession === session) this.consumeStatus(chunk);
    });
    child.once('error', (error) => {
      session.rejectReady(error);
      if (this.activeSession !== session) return;
      this.sendState({ type: 'error', message: error.message || 'Could not launch the embedded media engine.' });
      if (child.pid == null) {
        this.activeSession = null;
        if (this.child === child) this.child = null;
        this.closeSessionFramePorts(session);
      }
    });
    child.once('exit', (code, signal) => {
      session.rejectReady(new Error(`موتور پخش پیش از آماده‌شدن خارج شد (کد ${code ?? 'نامشخص'}).`));
      const reportAsUnexpected = shouldReportProcessExit(session, this.activeSession);
      if (this.activeSession === session) {
        this.activeSession = null;
        if (this.child === child) this.child = null;
      }
      if (reportAsUnexpected) {
        this.sendState({ type: 'process-exit', code, signal, reason: this.lastEngineError || '' });
      }
      this.closeSessionFramePorts(session);
    });

    await new Promise((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        child.off('spawn', onSpawn);
        child.off('error', onError);
      };
      child.once('spawn', onSpawn);
      child.once('error', onError);
    });

    if (warmup) {
      await this.waitForSessionReady(session);
      console.info('[Aura Player] Native video engine is warmed and ready for instant file loading.');
      return { started: true, prewarmed: true, engine: 'libmpv-render-host' };
    }

    return { started: true, engine: 'libmpv-render-host' };
  }

  loadIntoWarmSession(session, filePath, requestedStartTime = 0, requestedSize = {}) {
    const child = session?.child;
    if (!child || child.killed || !child.stdin.writable) {
      throw new Error('موتور آماده‌شده دیگر در دسترس نیست.');
    }
    const encodedPath = Buffer.from(filePath, 'utf8').toString('hex');
    if (!encodedPath || encodedPath.length > 32_768) {
      throw new TypeError('مسیر فایل ویدئو بیش از اندازه مجاز است.');
    }
    const startTime = Number.isFinite(Number(requestedStartTime))
      ? Math.max(0, Math.min(Number(requestedStartTime), 7 * 24 * 60 * 60))
      : 0;
    const width = Math.max(480, Math.min(MAX_RENDER_WIDTH, Math.round(Number(requestedSize.width) || 1920)));
    const height = Math.max(270, Math.min(MAX_RENDER_HEIGHT, Math.round(Number(requestedSize.height) || 1080)));

    this.latestFrame = null;
    this.lastEngineError = '';
    for (const [targetId, targetWindow] of this.frameWindows) {
      if (!session.ports.has(targetId)) this.attachSessionFramePort(session, targetId, targetWindow);
    }

    child.stdin.write(`resize ${width} ${height}\n`);
    child.stdin.write(`frames-enabled ${this.frameOutputEnabled ? 1 : 0}\n`);
    child.stdin.write(`load-file-hex ${encodedPath} ${startTime}\n`);
    session.isWarmup = false;
    session.filePath = filePath;
    this.prewarmPromise = null;
    console.info('[Aura Player] Reusing the warmed native engine; loading media without another process or GPU initialization.');
    return { started: true, reusedWarmup: true, engine: 'libmpv-render-host' };
  }

  async generateThumbnail(event, filePath, requestedTime = 0.0) {
    if (event) this.assertRenderer(event);
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new TypeError('The thumbnail media path must be an absolute local path.');
    }
    const info = await fs.promises.stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new Error('فایل برای ساخت تصویر بندانگشتی وجود ندارد یا معتبر نیست.');

    const { executable, runtimeDirectory } = this.resolveHelperPath();
    const time = Number.isFinite(Number(requestedTime))
      ? Math.max(0, Math.min(Number(requestedTime), 10))
      : 1.0;
    const key = crypto.createHash('sha256')
      .update(`${path.resolve(filePath)}\0${info.size}\0${info.mtimeMs}\0${time}`)
      .digest('hex');
    const cacheDirectory = path.join(this.app.getPath('userData'), 'thumbnail-cache');
    const cachePath = path.join(cacheDirectory, `${key}.rgba`);

    const existing = this.thumbnailPromises.get(key);
    if (existing) return existing;

    const operation = (async () => {
      try {
        const cached = await fs.promises.readFile(cachePath);
        return parseThumbnailFrame(cached);
      } catch {
        // Cache miss or an invalid/stale cache file: decode from the source.
      }

      const env = { ...process.env };
      const libraryDirectory = path.join(runtimeDirectory, 'lib');
      if (process.platform === 'win32') {
        env.PATH = `${runtimeDirectory}${path.delimiter}${env.PATH || ''}`;
      } else if (fs.existsSync(libraryDirectory)) {
        env.LD_LIBRARY_PATH = `${libraryDirectory}${path.delimiter}${env.LD_LIBRARY_PATH || ''}`;
      }

      const output = await new Promise((resolve, reject) => {
        const child = spawn(executable, [
          '--thumbnail', '--file', filePath, '--start', String(time), '--width', '320', '--height', '180',
        ], { cwd: runtimeDirectory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const chunks = [];
        let byteLength = 0;
        let stderr = '';
        let settled = false;
        let timeout;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          if (error) reject(error);
          else resolve(value);
        };
        timeout = setTimeout(() => {
          child.kill();
          finish(new Error('ساخت تصویر بندانگشتی با موتور داخلی بیش از ۱۲ ثانیه طول کشید.'));
        }, 12_000);

        child.stdout.on('data', (chunk) => {
          byteLength += chunk.length;
          if (byteLength > MAX_THUMBNAIL_BYTES + FRAME_HEADER_BYTES) {
            child.kill();
            finish(new Error('خروجی تصویر بندانگشتی از اندازهٔ مجاز بیشتر است.'));
            return;
          }
          chunks.push(chunk);
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk).slice(-16_384);
        });
        child.once('error', (error) => finish(error));
        child.once('close', (code, signal) => {
          if (code !== 0) {
            finish(new Error(stderr.trim() || `موتور ساخت thumbnail با کد ${code ?? signal ?? 'نامشخص'} متوقف شد.`));
            return;
          }
          finish(null, Buffer.concat(chunks, byteLength));
        });
      });

      const poster = parseThumbnailFrame(output);
      await fs.promises.mkdir(cacheDirectory, { recursive: true }).catch(() => {});
      await fs.promises.writeFile(cachePath, output, { mode: 0o600 }).catch(() => {});
      this.thumbnailWriteCount += 1;
      if (this.thumbnailWriteCount % 32 === 0) {
        await this.pruneThumbnailCache(cacheDirectory);
      }
      return poster;
    })();

    this.thumbnailPromises.set(key, operation);
    try {
      return await operation;
    } finally {
      this.thumbnailPromises.delete(key);
    }
  }

  async pruneThumbnailCache(directory) {
    try {
      const names = (await fs.promises.readdir(directory)).filter((name) => name.endsWith('.rgba'));
      if (names.length <= MAX_THUMBNAIL_CACHE_ENTRIES) return;
      const entries = await Promise.all(names.map(async (name) => {
        const file = path.join(directory, name);
        const info = await fs.promises.stat(file).catch(() => null);
        return info ? { file, mtimeMs: info.mtimeMs } : null;
      }));
      const oldestFirst = entries.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
      await Promise.all(oldestFirst.slice(MAX_THUMBNAIL_CACHE_ENTRIES).map((entry) =>
        fs.promises.unlink(entry.file).catch(() => {})
      ));
    } catch {
      // Thumbnail cache pruning is best-effort and must never block playback.
    }
  }

  consumeFrames(chunk) {
    if (chunk?.length) {
      this.stdoutChunks.push(chunk);
      this.stdoutBytes += chunk.length;
    }

    const takeBytes = (count) => {
      if (count === 0) return Buffer.alloc(0);
      if (this.stdoutBytes < count) return null;
      // Allocate a dedicated, tightly-sized backing store. This lets the
      // ArrayBuffer be sent directly through structured clone without first
      // making another Uint8Array copy or exposing unrelated bytes from a
      // pooled stdout Buffer's slab.
      const result = Buffer.allocUnsafeSlow(count);
      let written = 0;
      while (written < count) {
        const head = this.stdoutChunks[0];
        const take = Math.min(head.length, count - written);
        head.copy(result, written, 0, take);
        written += take;
        this.stdoutBytes -= take;
        if (take === head.length) this.stdoutChunks.shift();
        else this.stdoutChunks[0] = head.subarray(take);
      }
      return result;
    };

    while (true) {
      if (!this.pendingFrameHeader) {
        const header = takeBytes(FRAME_HEADER_BYTES);
        if (!header) return;
        const magic = header.readUInt32LE(0);
        const width = header.readUInt32LE(4);
        const height = header.readUInt32LE(8);
        const stride = header.readUInt32LE(12);
        const byteCount = header.readUInt32LE(16);
        const sequence = header.readUInt32LE(20);

        if (magic !== FRAME_MAGIC || width < 1 || height < 1 || width > 8192 || height > 8192 ||
            stride !== width * 4 || byteCount !== stride * height || byteCount > MAX_FRAME_BYTES) {
          this.sendState({ type: 'error', message: 'پروتکل فریم موتور داخلی نامعتبر است؛ پخش متوقف شد.' });
          void this.stop();
          return;
        }
        this.pendingFrameHeader = { width, height, byteCount, sequence };
      }

      const frame = takeBytes(this.pendingFrameHeader.byteCount);
      if (!frame) return;
      this.latestFrame = { ...this.pendingFrameHeader, pixelData: frame };
      this.pendingFrameHeader = null;
      this.flushLatestFrame();
    }
  }

  flushLatestFrame() {
    const session = this.activeSession;
    if (!this.latestFrame || this.awaitingAck || !session?.ports?.size) return;
    const frame = this.latestFrame;
    this.latestFrame = null;
    try {
      // Each renderer gets the same tightly-sized RGBA frame over its own
      // MessagePort. Backpressure is released only after every visible target
      // acknowledges the frame, so a slow PiP surface cannot build a queue.
      const frameBuffer = frame.pixelData.buffer;
      if (frame.pixelData.byteOffset !== 0 || frame.pixelData.byteLength !== frameBuffer.byteLength) {
        throw new Error('Native frame buffer is not tightly allocated.');
      }
      const sequence = frame.sequence || ++this.sequence;
      this.awaitingSequence = sequence;
      this.frameSentAtNs = process.hrtime.bigint();
      this.awaitingAck = true;
      session.pendingFrameAcks.clear();

      const pipOwnsFrameCadence = session.ports.has('pip');
      for (const [id, target] of session.ports) {
        if (target.window.isDestroyed?.() || target.window.webContents?.isDestroyed?.()) {
          session.ports.delete(id);
          if (this.frameWindows.get(id) === target.window) this.frameWindows.delete(id);
          continue;
        }
        // Once PiP is open, its visible canvas owns native render cadence.
        // The main window still receives frames, but a background/occluded
        // renderer cannot stall the always-on-top player by delaying its ACK.
        const mustAcknowledge = id === 'pip' || !pipOwnsFrameCadence;
        if (mustAcknowledge) session.pendingFrameAcks.add(id);
        try {
          target.port.postMessage({
            type: 'frame',
            width: frame.width,
            height: frame.height,
            sequence,
            data: frameBuffer,
          });
        } catch (error) {
          if (mustAcknowledge) session.pendingFrameAcks.delete(id);
          console.warn(`[Aura Player] Could not send a native frame to ${id}:`, error?.message || error);
        }
      }

      if (session.pendingFrameAcks.size === 0) this.acknowledgeFrame(session);
    } catch (error) {
      this.awaitingAck = false;
      session.pendingFrameAcks.clear();
      this.sendState({ type: 'error', message: `ارسال فریم به رابط کاربری ناموفق بود: ${error.message}` });
    }
  }

  acknowledgeFrame(session) {
    if (this.activeSession !== session || !this.awaitingAck || session.pendingFrameAcks.size > 0) return;
    this.awaitingAck = false;
    if (this.frameSentAtNs > 0n) {
      const ackMs = Number(process.hrtime.bigint() - this.frameSentAtNs) / 1e6;
      this.frameAckSamples += 1;
      this.frameAckTotalMs += ackMs;
      this.frameAckMaxMs = Math.max(this.frameAckMaxMs, ackMs);
      const elapsedMs = Date.now() - this.frameAckStatsStartedAt;
      if (elapsedMs >= 2000) {
        const fps = (this.frameAckSamples * 1000 / elapsedMs).toFixed(1);
        const averageAck = (this.frameAckTotalMs / this.frameAckSamples).toFixed(1);
        console.info(`[Aura Player] Frame transport: ${fps} acknowledged FPS; ACK avg ${averageAck} ms; max ${this.frameAckMaxMs.toFixed(1)} ms`);
        this.frameAckStatsStartedAt = Date.now();
        this.frameAckSamples = 0;
        this.frameAckTotalMs = 0;
        this.frameAckMaxMs = 0;
      }
      this.frameSentAtNs = 0n;
    }
    // The native decoder may produce the next frame only after all windows
    // have presented the current one.
    if (session.child && !session.child.killed && session.child.stdin.writable) {
      session.child.stdin.write('frame-ack\n');
    }
    this.flushLatestFrame();
  }

  consumeStatus(chunk) {
    this.stderrBuffer += chunk;
    if (this.stderrBuffer.length > 64 * 1024) {
      this.stderrBuffer = this.stderrBuffer.slice(-32 * 1024);
    }
    let lineEnd;
    while ((lineEnd = this.stderrBuffer.indexOf('\n')) !== -1) {
      const line = this.stderrBuffer.slice(0, lineEnd).trim();
      this.stderrBuffer = this.stderrBuffer.slice(lineEnd + 1);
      if (line.startsWith('AURA_STATE ')) {
        this.sendState({ type: 'state', ...this.parseKeyValues(line.slice(11)) });
      } else if (line.startsWith('AURA_EVENT ')) {
        const parsed = this.parseKeyValues(line.slice(11));
        if (parsed.type === 'ready') {
          const session = this.activeSession;
          if (session && !session.ready) {
            session.ready = true;
            session.resolveReady();
          }
        } else if (parsed.type === 'hwdec-interop-policy') {
          console.info('[Aura Player] Hardware-decoder interop: libmpv automatic discovery; hwdec=auto-safe');
        } else if (parsed.type === 'hwdec-current') {
          console.info(`[Aura Player] Active video decoder: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'gpu-profile' || parsed.type === 'gpu-renderer' || parsed.type === 'render-size-cap') {
          console.info(`[Aura Player] ${parsed.type}: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'hwdec-interop') {
          console.info(`[Aura Player] Selected hardware-decoder interop: ${parsed.detail || 'automatic'}`);
        } else if (parsed.type === 'sdl-driver') {
          console.info(`[Aura Player] SDL/OpenGL display backend: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'phase') {
          console.info(`[Aura Player] Native startup phase: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'frame-readback') {
          console.info(`[Aura Player] Frame readback: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'frame-orientation') {
          console.info(`[Aura Player] Frame orientation: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'video-quality-profile') {
          console.info(`[Aura Player] Video quality profile: ${parsed.detail || 'libmpv defaults'}`);
        } else if (parsed.type === 'framebuffer-format') {
          console.info(`[Aura Player] Intermediate framebuffer: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'video-output-size' || parsed.type === 'video-output-resized') {
          console.info(`[Aura Player] Render resolution: ${parsed.detail || 'unknown'}`);
        } else if (parsed.type === 'error') {
          this.lastEngineError = parsed.detail || 'The native engine failed without an error description.';
          console.error(`[Aura Player native engine] ${this.lastEngineError}`);
        }
        this.sendState({ type: 'event', eventName: parsed.type || 'unknown', detail: parsed.detail || '' });
      } else if (line) {
        console.warn('[Aura Player native engine]', line);
      }
    }
  }

  parseKeyValues(source) {
    return parseNativeStatus(source);
  }

  sendState(state) {
    for (const targetWindow of this.frameWindows.values()) {
      if (targetWindow.isDestroyed?.() || targetWindow.webContents?.isDestroyed?.()) continue;
      targetWindow.webContents.send('aura:embedded-mpv-state', state);
    }
  }

  command(event, command) {
    this.assertRenderer(event);
    return this.writeCommand(command);
  }

  // Internal Electron-main entry point. Callers must validate the originating
  // BrowserWindow before invoking this method; renderer IPC must use command().
  commandFromMain(command) {
    return this.writeCommand(command);
  }

  writeCommand(command) {
    if (!this.child || this.child.killed || !this.child.stdin.writable) return { sent: false };

    let line;
    switch (command?.type) {
      case 'play': line = 'play'; break;
      case 'pause': line = 'pause'; break;
      case 'toggle-pause': line = 'toggle-pause'; break;
      case 'stop': line = 'stop'; break;
      case 'seek': {
        const seconds = Number(command.seconds);
        if (!Number.isFinite(seconds)) throw new TypeError('Seek position must be a finite number.');
        line = `seek ${Math.max(0, seconds)}`;
        break;
      }
      case 'volume': {
        const value = Number(command.value);
        if (!Number.isFinite(value)) throw new TypeError('Volume must be a finite number.');
        line = `set volume ${Math.max(0, Math.min(100, value))}`;
        break;
      }
      case 'mute': line = `set mute ${command.value ? 'yes' : 'no'}`; break;
      case 'speed': {
        const value = Number(command.value);
        if (!Number.isFinite(value)) throw new TypeError('Playback speed must be a finite number.');
        line = `set speed ${Math.max(0.25, Math.min(16, value))}`;
        break;
      }
      case 'resize': {
        const width = Number(command.width);
        const height = Number(command.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) throw new TypeError('Render dimensions must be finite numbers.');
        const safeWidth = Math.max(480, Math.min(MAX_RENDER_WIDTH, Math.round(width)));
        const safeHeight = Math.max(270, Math.min(MAX_RENDER_HEIGHT, Math.round(height)));
        line = `resize ${safeWidth} ${safeHeight}`;
        break;
      }
      case 'audio-track':
        line = `set aid ${Math.max(0, Math.trunc(Number(command.value) || 0))}`;
        break;
      case 'subtitle-track':
        line = `set sid ${Math.max(0, Math.trunc(Number(command.value) || 0))}`;
        break;
      case 'subtitle-visibility':
        line = `set sub-visibility ${command.value ? 'yes' : 'no'}`;
        break;
      case 'loop':
        line = `set loop-file ${command.value ? 'inf' : 'no'}`;
        break;
      case 'cycle-audio-track': line = 'cycle aid'; break;
      case 'cycle-subtitle-track': line = 'cycle sid'; break;
      case 'add-subtitle': {
        const filePath = command.filePath;
        if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.length > 16384) {
          throw new TypeError('Subtitle path must be an absolute local path.');
        }
        line = `add-subtitle-hex ${Buffer.from(filePath, 'utf8').toString('hex')}`;
        break;
      }
      default:
        throw new Error('Unsupported embedded MPV command.');
    }

    this.child.stdin.write(`${line}\n`);
    return { sent: true };
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;

    const session = this.activeSession;
    const child = session?.child || this.child;
    if (session) session.stopRequested = true;
    this.activeSession = null;
    this.child = null;
    this.latestFrame = null;
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    if (session) this.closeSessionFramePorts(session);
    else this.closePort(this.port);

    if (!child) {
      this.thumbnailPromises = new Map();
      this.thumbnailWriteCount = 0;
      return { stopped: false };
    }

    this.stopping = true;
    const operation = (async () => {
      try {
        if (child.stdin?.writable) {
          child.stdin.write('quit\n');
          // EOF releases the native command-reader thread after it consumes quit.
          child.stdin.end();
        }
      } catch {
        // The helper may already have terminated.
      }

      // libmpv can take longer than a second to release decoder and GPU resources,
      // especially when a hardware decoder is draining a frame. Do not SIGTERM it
      // on that normal teardown path.
      const graceful = await waitForChildExit(child, 4500);
      let exited = graceful;
      if (!exited && child.exitCode === null && child.signalCode === null) {
        console.warn('[Aura Player] Native helper did not stop gracefully within 4.5 seconds; sending SIGTERM.');
        try { child.kill('SIGTERM'); } catch { /* process may already have exited */ }
        exited = await waitForChildExit(child, 1500);
      }
      if (!exited && child.exitCode === null && child.signalCode === null) {
        console.error('[Aura Player] Native helper ignored SIGTERM; sending SIGKILL.');
        try { child.kill('SIGKILL'); } catch { /* process may already have exited */ }
        await waitForChildExit(child, 1500);
      }
      return { stopped: true, graceful };
    })();

    this.stopPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.stopPromise === operation) this.stopPromise = null;
      this.stopping = false;
      this.thumbnailPromises = new Map();
      this.thumbnailWriteCount = 0;
    }
  }

  closePort(port = this.port) {
    if (!port) return;
    const isCurrentPort = this.port === port;
    try { port.close(); } catch { /* already closed */ }
    if (isCurrentPort) this.port = null;
  }

  closeSessionFramePorts(session) {
    if (!session?.ports) return;
    for (const target of session.ports.values()) {
      try { target.port.close(); } catch { /* already closed */ }
    }
    session.ports.clear();
    session.pendingFrameAcks.clear();
    if (this.activeSession === session || this.port) this.port = null;
    this.awaitingAck = false;
    this.latestFrame = null;
  }

  dispose() {
    return this.stop();
  }
}

module.exports = { EmbeddedMpvHost };
