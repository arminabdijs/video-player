'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const frameListeners = new Set();
const stateListeners = new Set();
const pipStateListeners = new Set();
const openMediaListeners = new Set();
const pendingMediaFiles = [];
let framePort = null;

ipcRenderer.on('aura:embedded-mpv-channel', (event) => {
  const nextPort = event.ports?.[0];
  if (!nextPort) return;
  if (framePort) {
    try { framePort.close(); } catch { /* already closed */ }
  }
  framePort = nextPort;
  framePort.onclose = () => { if (framePort === nextPort) framePort = null; };
  framePort.onmessage = (messageEvent) => {
    const frame = messageEvent.data;
    if (!frame || frame.type !== 'frame') return;
    for (const listener of frameListeners) {
      try { listener(frame); } catch (error) { console.error('[Aura Player] Frame listener failed:', error); }
    }
    try { framePort?.postMessage({ type: 'ack', sequence: frame.sequence }); } catch { /* the native host may be stopping */ }
  };
  framePort.start();
});

ipcRenderer.on('aura:open-media-file', (_event, descriptor) => {
  if (!descriptor || typeof descriptor.path !== 'string' || typeof descriptor.name !== 'string') return;
  if (openMediaListeners.size === 0) {
    pendingMediaFiles.push(descriptor);
    return;
  }
  for (const listener of openMediaListeners) {
    try { listener(descriptor); } catch (error) { console.error('[Aura Player] Open-media listener failed:', error); }
  }
});

ipcRenderer.on('aura:embedded-mpv-state', (_event, state) => {
  for (const listener of stateListeners) {
    try { listener(state); } catch (error) { console.error('[Aura Player] State listener failed:', error); }
  }
});

ipcRenderer.on('aura:pip-state', (_event, state) => {
  for (const listener of pipStateListeners) {
    try { listener(state); } catch (error) { console.error('[Aura Player] PiP state listener failed:', error); }
  }
});

contextBridge.exposeInMainWorld('auraDesktop', Object.freeze({
  isDesktop: true,
  getPathForFile(file) {
    if (!file || typeof file !== 'object') throw new TypeError('A real file selected by the user is required.');
    return webUtils.getPathForFile(file);
  },
  onOpenMediaFile(listener) {
    if (typeof listener !== 'function') throw new TypeError('Open-media listener must be a function.');
    openMediaListeners.add(listener);
    while (pendingMediaFiles.length) {
      const descriptor = pendingMediaFiles.shift();
      try { listener(descriptor); } catch (error) { console.error('[Aura Player] Open-media listener failed:', error); }
    }
    return () => openMediaListeners.delete(listener);
  },
  startEmbeddedMpv(filePath, startTime = 0, size = {}) {
    return ipcRenderer.invoke('aura:embedded-mpv-start', { filePath, startTime, size });
  },
  commandEmbeddedMpv(command) {
    return ipcRenderer.invoke('aura:embedded-mpv-command', command);
  },
  stopEmbeddedMpv() {
    return ipcRenderer.invoke('aura:embedded-mpv-stop');
  },
  generateEmbeddedMpvThumbnail(filePath, time = 0.0) {
    return ipcRenderer.invoke('aura:embedded-mpv-thumbnail', { filePath, time });
  },
  setNativePictureInPicture(active) {
    return ipcRenderer.invoke('aura:desktop-pip-set', Boolean(active));
  },
  onNativePictureInPictureState(listener) {
    if (typeof listener !== 'function') throw new TypeError('PiP state listener must be a function.');
    pipStateListeners.add(listener);
    return () => pipStateListeners.delete(listener);
  },
  onEmbeddedMpvFrame(listener) {
    if (typeof listener !== 'function') throw new TypeError('Frame listener must be a function.');
    frameListeners.add(listener);
    return () => frameListeners.delete(listener);
  },
  onEmbeddedMpvState(listener) {
    if (typeof listener !== 'function') throw new TypeError('State listener must be a function.');
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  },
}));
