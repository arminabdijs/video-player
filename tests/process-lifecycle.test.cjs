const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { shouldReportProcessExit, waitForChildExit } = require('../desktop/process-lifecycle.cjs');

test('intentional shutdown of an old native session is not reported as a playback failure', () => {
  const oldSession = { id: 1, stopRequested: true };
  const nextSession = { id: 2, stopRequested: false };

  assert.equal(shouldReportProcessExit(oldSession, null), false);
  assert.equal(shouldReportProcessExit(oldSession, nextSession), false);
});

test('unexpected exit from the active native session remains reportable', () => {
  const activeSession = { id: 3, stopRequested: false };
  assert.equal(shouldReportProcessExit(activeSession, activeSession), true);
});

test('child-exit wait observes an exit event', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;

  const waiting = waitForChildExit(child, 100);
  child.emit('exit', 0, null);
  assert.equal(await waiting, true);
});

test('child-exit wait handles an already-exited process without waiting for a timeout', async () => {
  const child = new EventEmitter();
  child.exitCode = 0;
  child.signalCode = null;
  assert.equal(await waitForChildExit(child, 100), true);
});

test('child-exit wait reports a bounded timeout when a process remains alive', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  assert.equal(await waitForChildExit(child, 5), false);
});
