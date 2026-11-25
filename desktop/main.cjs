'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { EmbeddedMpvHost } = require('./embedded-mpv-host.cjs');
const { isTrustedApplicationDocument, isTrustedRendererEvent } = require('./trusted-renderer.cjs');
const { findMediaArgument, describeMediaFile } = require('./media-arguments.cjs');

const APP_ROOT = app.getAppPath();
let mainWindow = null;
let pipWindow = null;
let pipResizeTimer = null;
let pipBoundsPersistTimer = null;
let pipResizeState = null;
let lastPipBounds = null;

const PIP_MIN_WIDTH = 320;
const PIP_MIN_HEIGHT = 180;
const PIP_BOUNDS_FILE = 'pip-window.json';
const PIP_RESIZE_DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
let mainFrameTargetDetached = false;
let embeddedMpv = null;
let isQuitting = false;
let rendererReady = false;
const pendingMediaFiles = [];
let lastGpuFeatureSnapshot = '';

function reportGpuFeatureStatus() {
  try {
    const features = app.getGPUFeatureStatus() || {};
    const snapshot = {
      hardwareAcceleration: app.isHardwareAccelerationEnabled(),
      gpuCompositing: features.gpu_compositing || 'unknown',
      rasterization: features.rasterization || 'unknown',
      videoDecode: features.video_decode || 'unknown',
      vpxDecode: features.vpx_decode || 'unknown',
      webgl: features.webgl || 'unknown',
      webgl2: features.webgl2 || 'unknown',
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastGpuFeatureSnapshot) return;
    lastGpuFeatureSnapshot = serialized;
    console.info('[Aura Player] Chromium GPU feature status:', serialized);
  } catch (error) {
    console.warn('[Aura Player] Chromium GPU feature status is not available yet:', error?.message || error);
  }
}

// Electron exposes these feature flags only after Chromium emits gpu-info-update.
app.on('gpu-info-update', reportGpuFeatureStatus);

if (process.platform === 'win32') {
  app.setAppUserModelId('info.arminabdi.aura-player');
}

// Keep Electron's Wayland app_id / X11 WM_CLASS identical to the installed
// info.arminabdi.aura-player.desktop launcher so GNOME groups the window
// under the correct icon instead of creating an unbranded second dock item.
if (process.platform === 'linux') {
  app.setDesktopName('info.arminabdi.aura-player');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const filePath = findMediaArgument(commandLine);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    if (filePath) queueMediaFile(filePath);
  });

  app.whenReady().then(() => {
    lastPipBounds = loadStoredPipBounds();
    createMainWindow();
    registerEmbeddedMpvIpc();
    const initialFile = findMediaArgument(process.argv);
    if (initialFile) queueMediaFile(initialFile);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#141218',
    show: false,
    autoHideMenuBar: true,
    title: 'Aura Player',
    icon: path.join(APP_ROOT, 'assets', 'icons', 'aura-player.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  embeddedMpv = new EmbeddedMpvHost({
    app,
    window: mainWindow,
    assertTrustedRenderer,
  });

  rendererReady = false;
  mainWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    embeddedMpv?.attachFrameTarget('main', mainWindow);
    flushPendingMediaFiles();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('minimize', () => {
    // If PiP is visible, route frames only to that window. This prevents a
    // minimized main renderer from throttling the shared native frame ACK.
    const pipActive = Boolean(pipWindow && !pipWindow.isDestroyed());
    if (pipActive && embeddedMpv?.detachFrameTarget('main')) mainFrameTargetDetached = true;
    embeddedMpv?.setFrameOutputEnabled(pipActive);
  });
  mainWindow.on('restore', () => {
    if (mainFrameTargetDetached && mainWindow && !mainWindow.isDestroyed()) {
      embeddedMpv?.attachFrameTarget('main', mainWindow);
      mainFrameTargetDetached = false;
    }
    embeddedMpv?.setFrameOutputEnabled(true);
    if (!mainWindow?.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('aura:desktop-window-restored');
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedApplicationDocument(targetUrl, path.join(APP_ROOT, 'index.html'))) {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    rendererReady = false;
    if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
    void embeddedMpv?.dispose();
    embeddedMpv = null;
    mainWindow = null;
  });

  void mainWindow.loadFile(path.join(APP_ROOT, 'index.html'));
}

function getPipWorkArea(referenceBounds) {
  const display = referenceBounds
    ? screen.getDisplayMatching(referenceBounds)
    : screen.getPrimaryDisplay();
  return display.workArea || display.bounds;
}

function getPipSizeLimits(referenceBounds) {
  const area = getPipWorkArea(referenceBounds);
  return {
    minWidth: Math.min(PIP_MIN_WIDTH, area.width),
    minHeight: Math.min(PIP_MIN_HEIGHT, area.height),
    maxWidth: Math.max(1, area.width),
    maxHeight: Math.max(1, area.height),
  };
}

function clampPipValue(value, minimum, maximum) {
  const safeMaximum = Math.max(minimum, maximum);
  const numeric = Number(value);
  return Math.max(minimum, Math.min(safeMaximum, Math.round(Number.isFinite(numeric) ? numeric : minimum)));
}

function loadStoredPipBounds() {
  try {
    const filePath = path.join(app.getPath('userData'), PIP_BOUNDS_FILE);
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!stored || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(Number(stored[key])))) {
      return null;
    }
    return {
      x: Math.round(Number(stored.x)),
      y: Math.round(Number(stored.y)),
      width: Math.round(Number(stored.width)),
      height: Math.round(Number(stored.height)),
    };
  } catch {
    return null;
  }
}

function persistPipBounds(bounds) {
  try {
    const directory = app.getPath('userData');
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, PIP_BOUNDS_FILE);
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(bounds), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    console.warn('[Aura Player] Could not persist PiP window bounds:', error?.message || error);
  }
}

function getInitialPipBounds() {
  const stored = lastPipBounds;
  const candidate = stored
    ? { x: stored.x, y: stored.y, width: stored.width, height: stored.height }
    : { ...screen.getPrimaryDisplay().workArea, width: 480, height: 270 };
  const area = getPipWorkArea(candidate);
  const limits = getPipSizeLimits(candidate);
  const width = clampPipValue(candidate.width, limits.minWidth, limits.maxWidth);
  const height = clampPipValue(candidate.height, limits.minHeight, limits.maxHeight);
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);

  return {
    x: Math.max(area.x, Math.min(maxX, Math.round(Number(candidate.x) || area.x))),
    y: Math.max(area.y, Math.min(maxY, Math.round(Number(candidate.y) || area.y))),
    width,
    height,
  };
}

function rememberPipBounds(window = pipWindow, persistImmediately = false) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const limits = getPipSizeLimits(bounds);
  lastPipBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: clampPipValue(bounds.width, limits.minWidth, limits.maxWidth),
    height: clampPipValue(bounds.height, limits.minHeight, limits.maxHeight),
  };

  if (pipBoundsPersistTimer) clearTimeout(pipBoundsPersistTimer);
  if (persistImmediately) {
    pipBoundsPersistTimer = null;
    persistPipBounds(lastPipBounds);
    return;
  }
  pipBoundsPersistTimer = setTimeout(() => {
    pipBoundsPersistTimer = null;
    if (lastPipBounds) persistPipBounds(lastPipBounds);
  }, 250);
  pipBoundsPersistTimer.unref?.();
}

function isTrustedPipResizeEvent(event) {
  if (!pipWindow || pipWindow.isDestroyed()) {
    pipResizeState = null;
    return false;
  }
  try {
    assertTrustedPipRenderer(event);
    return true;
  } catch (error) {
    console.warn('[Aura Player] Ignored an untrusted PiP resize event:', error?.message || error);
    return false;
  }
}

function beginNativePipResize(event, payload) {
  if (!isTrustedPipResizeEvent(event) || !PIP_RESIZE_DIRECTIONS.has(payload?.direction)) return false;

  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false;

  pipResizeState = {
    direction: payload.direction,
    pointerX: screenX,
    pointerY: screenY,
    bounds: pipWindow.getBounds(),
  };
  return true;
}

function updateNativePipResize(event, payload) {
  if (!isTrustedPipResizeEvent(event) || !pipResizeState) return;

  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

  const state = pipResizeState;
  const deltaX = screenX - state.pointerX;
  const deltaY = screenY - state.pointerY;
  const { x: originalX, y: originalY, width: originalWidth, height: originalHeight } = state.bounds;
  const limits = getPipSizeLimits(state.bounds);
  let x = originalX;
  let y = originalY;
  let width = originalWidth;
  let height = originalHeight;

  if (state.direction.includes('e')) {
    width = clampPipValue(originalWidth + deltaX, limits.minWidth, limits.maxWidth);
  } else if (state.direction.includes('w')) {
    width = clampPipValue(originalWidth - deltaX, limits.minWidth, limits.maxWidth);
    x = originalX + originalWidth - width;
  }

  if (state.direction.includes('s')) {
    height = clampPipValue(originalHeight + deltaY, limits.minHeight, limits.maxHeight);
  } else if (state.direction.includes('n')) {
    height = clampPipValue(originalHeight - deltaY, limits.minHeight, limits.maxHeight);
    y = originalY + originalHeight - height;
  }

  const current = pipWindow.getBounds();
  if (current.x !== x || current.y !== y || current.width !== width || current.height !== height) {
    pipWindow.setBounds({ x, y, width, height });
    rememberPipBounds(pipWindow);
  }
}

function endNativePipResize(event) {
  if (!isTrustedPipResizeEvent(event)) return;
  pipResizeState = null;
  rememberPipBounds(pipWindow);
}

async function openNativePictureInPicture(event) {
  assertTrustedRenderer(event);
  if (!embeddedMpv?.activeSession || !embeddedMpv.child || embeddedMpv.child.killed) {
    throw new Error('برای باز کردن تصویر در تصویر، ابتدا یک ویدئوی دسکتاپ را پخش کن.');
  }

  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.setAlwaysOnTop(true, 'screen-saver');
    pipWindow.showInactive();
    pipWindow.moveTop();
    return { active: true };
  }

  const restoredBounds = getInitialPipBounds();
  const window = new BrowserWindow({
    ...restoredBounds,
    minWidth: getPipSizeLimits(restoredBounds).minWidth,
    minHeight: getPipSizeLimits(restoredBounds).minHeight,
    useContentSize: true,
    backgroundColor: '#08090d',
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: 'Aura Player — تصویر در تصویر',
    icon: path.join(APP_ROOT, 'assets', 'icons', 'aura-player.png'),
    webPreferences: {
      preload: path.join(__dirname, 'pip-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });
  pipWindow = window;

  const keepOnTop = () => {
    if (!window.isDestroyed()) window.setAlwaysOnTop(true, 'screen-saver');
  };
  window.on('blur', keepOnTop);
  window.on('show', keepOnTop);
  window.on('move', () => rememberPipBounds(window));
  window.on('resize', () => {
    rememberPipBounds(window);
    schedulePipRenderResize();
  });
  window.on('close', () => rememberPipBounds(window, true));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (navigationEvent, targetUrl) => {
    if (!isTrustedApplicationDocument(targetUrl, path.join(__dirname, 'pip.html'))) {
      navigationEvent.preventDefault();
    }
  });
  window.on('closed', () => {
    rememberPipBounds(window);
    pipResizeState = null;
    if (pipResizeTimer) {
      clearTimeout(pipResizeTimer);
      pipResizeTimer = null;
    }
    embeddedMpv?.detachFrameTarget('pip');
    if (pipWindow === window) pipWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      if (mainFrameTargetDetached && !mainWindow.isMinimized()) {
        embeddedMpv?.attachFrameTarget('main', mainWindow);
        mainFrameTargetDetached = false;
      }
      mainWindow.webContents.send('aura:pip-state', { active: false });
    }
    if (mainWindow?.isMinimized()) embeddedMpv?.setFrameOutputEnabled(false);
  });

  try {
    await window.loadFile(path.join(__dirname, 'pip.html'));
    if (pipWindow !== window || window.isDestroyed()) throw new Error('پنجرهٔ تصویر در تصویر بسته شد.');
    embeddedMpv.attachFrameTarget('pip', window);
    // The main player is dimmed while PiP is active. Stop copying every frame
    // into its hidden canvas; send one full-rate stream only to the visible PiP.
    if (embeddedMpv.detachFrameTarget('main')) mainFrameTargetDetached = true;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.showInactive();
    window.moveTop();
    mainWindow?.webContents.send('aura:pip-state', { active: true });
    schedulePipRenderResize();
    return { active: true };
  } catch (error) {
    if (!window.isDestroyed()) window.close();
    throw error;
  }
}

function getNativePipRenderSize() {
  if (!pipWindow || pipWindow.isDestroyed()) return null;
  const bounds = pipWindow.getContentBounds();
  const display = screen.getDisplayMatching(pipWindow.getBounds());
  const scale = Math.max(1, Math.min(2, Number(display?.scaleFactor) || 1));
  return {
    width: Math.max(480, Math.min(1920, Math.round(bounds.width * scale))),
    height: Math.max(270, Math.min(1080, Math.round(bounds.height * scale))),
  };
}

function schedulePipRenderResize() {
  if (pipResizeTimer) clearTimeout(pipResizeTimer);
  pipResizeTimer = setTimeout(() => {
    pipResizeTimer = null;
    if (!embeddedMpv?.activeSession) return;
    const size = getNativePipRenderSize();
    if (!size) return;
    try {
      embeddedMpv.commandFromMain({ type: 'resize', ...size });
    } catch (error) {
      console.warn('[Aura Player] Could not resize native PiP output:', error?.message || error);
    }
  }, 120);
}

function closeNativePictureInPicture() {
  if (!pipWindow || pipWindow.isDestroyed()) return { active: false };
  pipWindow.close();
  return { active: false };
}

function assertTrustedPipRenderer(event) {
  if (!pipWindow || pipWindow.isDestroyed() ||
      !isTrustedRendererEvent(event, pipWindow.webContents, path.join(__dirname, 'pip.html'))) {
    const senderUrl = typeof event?.senderFrame?.url === 'string' ? event.senderFrame.url : 'unavailable';
    throw new Error(`Untrusted IPC sender: expected the Aura Player PiP document; received ${senderUrl}.`);
  }
}

function queueMediaFile(filePath) {
  const descriptor = describeMediaFile(filePath);
  if (!descriptor) return false;
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    pendingMediaFiles.push(descriptor);
    return true;
  }
  mainWindow.webContents.send('aura:open-media-file', descriptor);
  return true;
}

function flushPendingMediaFiles() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  while (pendingMediaFiles.length) {
    const descriptor = pendingMediaFiles.shift();
    if (descriptor) mainWindow.webContents.send('aura:open-media-file', descriptor);
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueMediaFile(filePath);
});

function assertTrustedRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed() ||
      !isTrustedRendererEvent(event, mainWindow.webContents, path.join(APP_ROOT, 'index.html'))) {
    const senderUrl = typeof event?.senderFrame?.url === 'string' ? event.senderFrame.url : 'unavailable';
    throw new Error(`Untrusted IPC sender: expected the Aura Player main document; received ${senderUrl}.`);
  }
}

function registerEmbeddedMpvIpc() {
  ipcMain.handle('aura:embedded-mpv-start', (event, payload) => {
    assertTrustedRenderer(event);
    // While PiP is detached, render near the floating window's physical size
    // instead of continuing to push full-screen frames to both renderers.
    const size = getNativePipRenderSize() || payload?.size;
    return embeddedMpv.start(event, payload?.filePath, payload?.startTime, size);
  });
  ipcMain.handle('aura:embedded-mpv-command', (event, command) => {
    assertTrustedRenderer(event);
    return embeddedMpv.command(event, command);
  });
  ipcMain.handle('aura:embedded-mpv-stop', (event) => {
    assertTrustedRenderer(event);
    return embeddedMpv.stop();
  });
  ipcMain.handle('aura:embedded-mpv-thumbnail', (event, payload) => {
    assertTrustedRenderer(event);
    return embeddedMpv.generateThumbnail(event, payload?.filePath, payload?.time);
  });
  ipcMain.handle('aura:desktop-pip-set', (event, active) => {
    assertTrustedRenderer(event);
    return active ? openNativePictureInPicture(event) : closeNativePictureInPicture();
  });
  ipcMain.on('aura:pip-resize-start', (event, payload) => {
    beginNativePipResize(event, payload);
  });
  ipcMain.on('aura:pip-resize-update', (event, payload) => {
    updateNativePipResize(event, payload);
  });
  ipcMain.on('aura:pip-resize-end', (event) => {
    endNativePipResize(event);
  });
  ipcMain.handle('aura:pip-command', (event, command) => {
    assertTrustedPipRenderer(event);
    if (!command || !['toggle-pause', 'play', 'pause', 'seek', 'volume', 'mute'].includes(command.type)) {
      throw new TypeError('دستور کنترل پنجرهٔ تصویر در تصویر مجاز نیست.');
    }
    return embeddedMpv.commandFromMain(command);
  });
  ipcMain.handle('aura:pip-close', (event) => {
    assertTrustedPipRenderer(event);
    return closeNativePictureInPicture();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  if (pipWindow && !pipWindow.isDestroyed()) pipWindow.destroy();
  void embeddedMpv?.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && !isQuitting) createMainWindow();
});
