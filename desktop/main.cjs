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

  rendererReady = false;
  mainWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    flushPendingMediaFiles();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('minimize', () => {
    // Keep native frames flowing while the independent always-on-top PiP
    // surface is visible; otherwise audio would continue over a frozen image.
    embeddedMpv?.setFrameOutputEnabled(Boolean(pipWindow && !pipWindow.isDestroyed()));
  });
  mainWindow.on('restore', () => embeddedMpv?.setFrameOutputEnabled(true));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedApplicationDocument(targetUrl, path.join(APP_ROOT, 'index.html'))) {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    rendererReady = false;
    void embeddedMpv?.dispose();
    embeddedMpv = null;
    mainWindow = null;
  });

  void mainWindow.loadFile(path.join(APP_ROOT, 'index.html'));
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

  const window = new BrowserWindow({
    width: 480,
    height: 270,
    minWidth: 320,
    minHeight: 180,
    maxWidth: 960,
    maxHeight: 640,
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
      webSecurity: true,
    },
  });
  pipWindow = window;

  const keepOnTop = () => {
    if (!window.isDestroyed()) window.setAlwaysOnTop(true, 'screen-saver');
  };
  window.on('blur', keepOnTop);
  window.on('show', keepOnTop);
  window.on('resize', schedulePipRenderResize);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (navigationEvent, targetUrl) => {
    if (!isTrustedApplicationDocument(targetUrl, path.join(__dirname, 'pip.html'))) {
      navigationEvent.preventDefault();
    }
  });
  window.on('closed', () => {
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
      embeddedMpv.command(null, { type: 'resize', ...size });
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
  ipcMain.handle('aura:pip-command', (event, command) => {
    assertTrustedPipRenderer(event);
    if (!command || !['toggle-pause', 'play', 'pause', 'seek', 'volume', 'mute'].includes(command.type)) {
      throw new TypeError('دستور کنترل پنجرهٔ تصویر در تصویر مجاز نیست.');
    }
    return embeddedMpv.command(null, command);
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
