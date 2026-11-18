'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { EmbeddedMpvHost } = require('./embedded-mpv-host.cjs');
const { isTrustedApplicationDocument, isTrustedRendererEvent } = require('./trusted-renderer.cjs');
const { findMediaArgument, describeMediaFile } = require('./media-arguments.cjs');

const APP_ROOT = app.getAppPath();
let mainWindow = null;
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
  mainWindow.on('minimize', () => embeddedMpv?.setFrameOutputEnabled(false));
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
    return embeddedMpv.start(event, payload?.filePath, payload?.startTime, payload?.size);
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
}

app.on('before-quit', () => {
  isQuitting = true;
  void embeddedMpv?.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && !isQuitting) createMainWindow();
});
