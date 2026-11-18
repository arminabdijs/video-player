const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNativeStatus } = require('../desktop/native-status.cjs');

test('native status parser preserves complete multi-word startup errors', () => {
  const result = parseNativeStatus('type=error detail=Could not initialize SDL OpenGL context: EGL_BAD_MATCH');
  assert.equal(result.type, 'error');
  assert.equal(result.detail, 'Could not initialize SDL OpenGL context: EGL_BAD_MATCH');
});

test('native status parser preserves punctuation and equals signs in detail', () => {
  const result = parseNativeStatus('type=error detail=MPV option failed: key=value (error -5)');
  assert.equal(result.detail, 'MPV option failed: key=value (error -5)');
});

test('native status parser still converts ordinary typed fields', () => {
  const result = parseNativeStatus('type=state paused=true time=12.5 width=1920 detail=frame ready');
  assert.equal(result.type, 'state');
  assert.equal(result.paused, true);
  assert.equal(result.time, 12.5);
  assert.equal(result.width, 1920);
  assert.equal(result.detail, 'frame ready');
});
