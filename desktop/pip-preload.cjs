'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const frameListeners = new Set();
const stateListeners = new Set();
const titleListeners = new Set();
let framePort = null;

ipcRenderer.on('aura:pip-title', (_event, title) => {
  const safeTitle = typeof title === 'string' ? title.slice(0, 512) : 'Aura Player';
  for (const listener of titleListeners) {
    try { listener(safeTitle); } catch (error) {
      console.error('[Aura Player PiP] Title listener failed:', error);
    }
  }
});

ipcRenderer.on('aura:embedded-mpv-channel', (event) => {
  const nextPort = event.ports?.[0];
  if (!nextPort) return;
  if (framePort) {
    try { framePort.close(); } catch { /* previous channel already closed */ }
  }
  framePort = nextPort;
  framePort.onclose = () => {
    if (framePort === nextPort) framePort = null;
  };
  framePort.onmessage = (messageEvent) => {
    const frame = messageEvent.data;
    if (!frame || frame.type !== 'frame') return;
    for (const listener of frameListeners) {
      try { listener(frame); } catch (error) {
        console.error('[Aura Player PiP] Frame listener failed:', error);
      }
    }
    try {
      framePort?.postMessage({ type: 'ack', sequence: frame.sequence });
    } catch {
      // The playback engine may be stopping while this frame is being drawn.
    }
  };
  framePort.start();
});

ipcRenderer.on('aura:embedded-mpv-state', (_event, state) => {
  for (const listener of stateListeners) {
    try { listener(state); } catch (error) {
      console.error('[Aura Player PiP] State listener failed:', error);
    }
  }
});

contextBridge.exposeInMainWorld('auraPip', Object.freeze({
  onFrame(listener) {
    if (typeof listener !== 'function') throw new TypeError('Frame listener must be a function.');
    frameListeners.add(listener);
    return () => frameListeners.delete(listener);
  },
  onState(listener) {
    if (typeof listener !== 'function') throw new TypeError('State listener must be a function.');
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  },
  onTitle(listener) {
    if (typeof listener !== 'function') throw new TypeError('Title listener must be a function.');
    titleListeners.add(listener);
    return () => titleListeners.delete(listener);
  },
  command(command) {
    return ipcRenderer.invoke('aura:pip-command', command);
  },
  close() {
    return ipcRenderer.invoke('aura:pip-close');
  },
  startResize(direction, screenX, screenY) {
    if (!['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(direction) ||
        !Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
    ipcRenderer.send('aura:pip-resize-start', { direction, screenX, screenY });
  },
  updateResize(screenX, screenY) {
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
    ipcRenderer.send('aura:pip-resize-update', { screenX, screenY });
  },
  endResize() {
    ipcRenderer.send('aura:pip-resize-end');
  },
}));
