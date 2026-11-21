'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { EmbeddedMpvHost } = require('./embedded-mpv-host.cjs');
const { isTrustedApplicationDocument, isTrustedRendererEvent } = require('./trusted-renderer.cjs');
const { findMediaArgument, describeMediaFile } = require('./media-arguments.cjs');

const APP_ROOT = app.getAppPath();
let mainWindow = null;
let pipWindow = null;
let pipResizeTimer = null;
let pipResizeState = null;
let lastPipBounds = null;

const PIP_MIN_WIDTH = 320;
const PIP_MIN_HEIGHT = 180;
const PIP_MAX_WIDTH = 960;
const PIP_MAX_HEIGHT = 640;
const PIP_RESIZE_DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
let mainFrameTargetDetached = false;
let embeddedMpv = null;
let isQuitting = false;
let rendererReady = false;
const pendingMediaFiles = [];

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

  // Warm up SDL/OpenGL and libmpv while Chromium loads the UI. Opening the
  // first file then only sends a load command instead of spawning the renderer.
  void embeddedMpv.prewarm({ width: 1280, height: 720 }).catch((error) => {
    console.warn('[Aura Player] Native prewarm unavailable; playback will initialize on demand:', error?.message || error);
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

function clampPipValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function getInitialPipBounds() {
  if (!lastPipBounds) return { width: 480, height: 270 };

  const width = clampPipValue(lastPipBounds.width, PIP_MIN_WIDTH, PIP_MAX_WIDTH);
  const height = clampPipValue(lastPipBounds.height, PIP_MIN_HEIGHT, PIP_MAX_HEIGHT);
  const candidate = {
    x: Math.round(Number(lastPipBounds.x) || 0),
    y: Math.round(Number(lastPipBounds.y) || 0),
    width,
    height,
  };
  const display = screen.getDisplayMatching(candidate);
  const area = display.workArea || display.bounds;
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);

  return {
    ...candidate,
    x: Math.max(area.x, Math.min(maxX, candidate.x)),
    y: Math.max(area.y, Math.min(maxY, candidate.y)),
  };
}

function rememberPipBounds(window = pipWindow) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  lastPipBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: clampPipValue(bounds.width, PIP_MIN_WIDTH, PIP_MAX_WIDTH),
    height: clampPipValue(bounds.height, PIP_MIN_HEIGHT, PIP_MAX_HEIGHT),
  };
}

function beginNativePipResize(event, payload) {
  assertTrustedPipRenderer(event);
  if (!pipWindow || pipWindow.isDestroyed() ||
      !PIP_RESIZE_DIRECTIONS.has(payload?.direction)) return false;

  const screenX = Number(payload.screenX);
  const screenY = Number(payload.screenY);
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
  assertTrustedPipRenderer(event);
  if (!pipResizeState || !pipWindow || pipWindow.isDestroyed()) return;

  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

  const state = pipResizeState;
  const deltaX = screenX - state.pointerX;
  const deltaY = screenY - state.pointerY;
  const { x: originalX, y: originalY, width: originalWidth, height: originalHeight } = state.bounds;
  let x = originalX;
  let y = originalY;
  let width = originalWidth;
  let height = originalHeight;

  if (state.direction.includes('e')) {
    width = clampPipValue(originalWidth + deltaX, PIP_MIN_WIDTH, PIP_MAX_WIDTH);
  } else if (state.direction.includes('w')) {
    width = clampPipValue(originalWidth - deltaX, PIP_MIN_WIDTH, PIP_MAX_WIDTH);
    x = originalX + originalWidth - width;
  }

  if (state.direction.includes('s')) {
    height = clampPipValue(originalHeight + deltaY, PIP_MIN_HEIGHT, PIP_MAX_HEIGHT);
  } else if (state.direction.includes('n')) {
    height = clampPipValue(originalHeight - deltaY, PIP_MIN_HEIGHT, PIP_MAX_HEIGHT);
    y = originalY + originalHeight - height;
  }

  const current = pipWindow.getBounds();
  if (current.x !== x || current.y !== y || current.width !== width || current.height !== height) {
    pipWindow.setBounds({ x, y, width, height });
    rememberPipBounds(pipWindow);
  }
}

function endNativePipResize(event) {
  assertTrustedPipRenderer(event);
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
    minWidth: PIP_MIN_WIDTH,
    minHeight: PIP_MIN_HEIGHT,
    maxWidth: PIP_MAX_WIDTH,
    maxHeight: PIP_MAX_HEIGHT,
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
      mainWindow.webContents.send('aura:pip-state', { active: false });
    }
    if (mainWindow?.isMinimized()) embeddedMpv?.setFrameOutputEnabled(false);
  });

  try {
    await window.loadFile(path.join(__dirname, 'pip.html'));
    if (pipWindow !== window || window.isDestroyed()) throw new Error('پنجرهٔ تصویر در تصویر بسته شد.');
    embeddedMpv.attachFrameTarget('pip', window);
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
