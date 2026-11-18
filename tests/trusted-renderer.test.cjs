const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  isTrustedApplicationDocument,
  isTrustedRendererEvent,
} = require('../desktop/trusted-renderer.cjs');

const documentPath = path.resolve(__dirname, '../index.html');
const documentUrl = pathToFileURL(documentPath).href;

function makeEvent({ sender = webContents, url = documentUrl, parent = null } = {}) {
  return { sender, senderFrame: { url, parent } };
}

const webContents = { isDestroyed: () => false };

test('trusts the exact local Aura Player document', () => {
  assert.equal(isTrustedApplicationDocument(documentUrl, documentPath), true);
  assert.equal(isTrustedRendererEvent(makeEvent(), webContents, documentPath), true);
});

test('does not trust another local HTML document', () => {
  const otherDocument = pathToFileURL(path.join(__dirname, 'other.html')).href;
  assert.equal(isTrustedApplicationDocument(otherDocument, documentPath), false);
  assert.equal(isTrustedRendererEvent(makeEvent({ url: otherDocument }), webContents, documentPath), false);
});

test('does not trust remote or non-file documents', () => {
  assert.equal(isTrustedRendererEvent(makeEvent({ url: 'https://example.com/' }), webContents, documentPath), false);
  assert.equal(isTrustedRendererEvent(makeEvent({ url: 'about:blank' }), webContents, documentPath), false);
});

test('does not trust iframe IPC even when it uses the application URL', () => {
  const parentFrame = { url: documentUrl, parent: null };
  assert.equal(isTrustedRendererEvent(makeEvent({ parent: parentFrame }), webContents, documentPath), false);
});

test('does not trust a different WebContents or a destroyed window', () => {
  assert.equal(isTrustedRendererEvent(makeEvent({ sender: {} }), webContents, documentPath), false);
  assert.equal(isTrustedRendererEvent(makeEvent(), { isDestroyed: () => true }, documentPath), false);
});
