'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.cjs'), 'utf8');
const script = fs.readFileSync(path.join(root, 'scripts/script.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'desktop/embedded-mpv-host.cjs'), 'utf8');
const native = fs.readFileSync(path.join(root, 'native/mpv-frame-host/main.cpp'), 'utf8');

test('Windows and Linux packages advertise common video file types', () => {
  const associations = packageJson.build.win.fileAssociations;
  assert.ok(associations.some((association) => association.ext.includes('mp4') && association.ext.includes('mkv')));
  assert.equal(packageJson.build.nsis.perMachine, true);
  assert.ok(packageJson.build.linux.mimeTypes.includes('video/x-matroska'));
  assert.ok(packageJson.build.linux.mimeTypes.includes('video/mp4'));
});

test('OS-opened media is queued until the trusted renderer is ready', () => {
  assert.match(main, /app\.on\('second-instance'/);
  assert.match(main, /app\.on\('open-file'/);
  assert.match(main, /pendingMediaFiles/);
  assert.match(main, /did-finish-load/);
  assert.match(main, /webContents\.send\('aura:open-media-file'/);
  assert.doesNotMatch(main, /embeddedMpv\.start\(null, filePath/);
});

test('preload exposes validated OS-open notifications without enabling Node in the renderer', () => {
  assert.match(preload, /ipcRenderer\.on\('aura:open-media-file'/);
  assert.match(preload, /onOpenMediaFile\(listener\)/);
  assert.match(preload, /webUtils\.getPathForFile\(file\)/);
});

test('OS-opened media enters the regular playlist and embedded playback surface', () => {
  assert.match(script, /function handleExternalMediaOpen\(descriptor\)/);
  assert.match(script, /new File\(\[\], descriptor\.name/);
  assert.match(script, /externalPath: descriptor\.path/);
  assert.match(script, /browserUrl: typeof descriptor\.browserUrl === 'string'/);
  assert.match(script, /renderExplorer\(\);\s*playIndex\(0, \[item\]\)/);
  assert.match(script, /card\._videoPath = item\.externalPath/);
  assert.match(script, /card\._videoPath \|\| window\.auraDesktop\.getPathForFile\(file\)/);
  assert.match(script, /item\.externalPath \|\| desktop\.getPathForFile\(item\.file\)/);
  assert.match(script, /const sourceUrl = item\.externalPath \? item\.browserUrl : URL\.createObjectURL\(item\.file\)/);
});

test('native presentation pauses on minimize unless PiP owns the live frame surface', () => {
  assert.match(main, /mainWindow\.on\('minimize',[\s\S]*?const pipActive = Boolean\(pipWindow && !pipWindow\.isDestroyed\(\)\)/);
  assert.match(main, /if \(pipActive && embeddedMpv\?\.detachFrameTarget\('main'\)\)/);
  assert.match(main, /embeddedMpv\?\.setFrameOutputEnabled\(pipActive\)/);
  assert.match(main, /mainWindow\.on\('restore',[\s\S]*?setFrameOutputEnabled\(true\)/);
  assert.match(main, /attachFrameTarget\('main', mainWindow\)/);
  assert.match(host, /setFrameOutputEnabled\(enabled\)/);
  assert.match(native, /g_frameOutputEnabled/);
  assert.match(native, /command == "frames-enabled"/);
  assert.match(native, /frameOutputEnabled && frameSlotAvailable/);
});
