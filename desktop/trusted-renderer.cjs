'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');

/**
 * Validate IPC from the one application document loaded in the main BrowserWindow.
 * Do not compare WebFrameMain objects by JavaScript reference: Electron may expose
 * different wrapper objects for the same underlying frame across IPC boundaries.
 */
function isTrustedApplicationDocument(candidateUrl, documentPath) {
  if (typeof candidateUrl !== 'string' || typeof documentPath !== 'string') return false;

  try {
    const url = new URL(candidateUrl);
    if (url.protocol !== 'file:') return false;
    return path.resolve(fileURLToPath(url)) === path.resolve(documentPath);
  } catch {
    return false;
  }
}

function isTrustedRendererEvent(event, webContents, documentPath) {
  if (!event || !webContents || webContents.isDestroyed?.()) return false;
  if (event.sender !== webContents) return false;

  const frame = event.senderFrame;
  if (!frame) return false;

  // Main frames have no parent. Reject iframe-originated IPC even if its URL
  // happens to point at the application document.
  if (frame.parent !== null) return false;

  return isTrustedApplicationDocument(frame.url, documentPath);
}

module.exports = {
  isTrustedApplicationDocument,
  isTrustedRendererEvent,
};
