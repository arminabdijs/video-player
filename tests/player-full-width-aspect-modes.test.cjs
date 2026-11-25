'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the shell and player workspace use the full available width on wide displays', () => {
  const css = read('css/style.css');
  assert.match(css, /AURA 2\.5 — FULL-WIDTH WORKSPACE/);
  assert.match(css, /\.m3-shell\s*\{[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*none\s*!important;/s);
  assert.match(css, /\.m3-player-card\s*\{[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*none\s*!important;/s);
});

test('fullscreen expands the complete player stage and its native Canvas to the viewport', () => {
  const css = read('css/style.css');
  const script = read('scripts/script.js');
  assert.match(css, /\.m3-player-card:fullscreen[\s\S]*?height:\s*100dvh\s*!important/);
  assert.match(css, /\.m3-player-card\.is-fullscreen\s*>\s*#nativeVideoCanvas/);
  assert.match(script, /playerStage\.requestFullscreen\(\{\s*navigationUI:\s*'hide'\s*\}\)/);
  assert.match(script, /fullscreenBtn\.setAttribute\('aria-pressed', String\(active\)\)/);
});

test('contain, cover and fill are applied to the native Canvas as well as HTML video', () => {
  const script = read('scripts/script.js');
  assert.match(script, /video\.style\.objectFit\s*=\s*mode\.value/);
  assert.match(script, /nativeVideoCanvas\.style\.objectFit\s*=\s*mode\.value/);
  assert.match(script, /ASPECT_RATIO_MODES\s*=\s*\[[\s\S]*?value:\s*'contain'[\s\S]*?value:\s*'cover'[\s\S]*?value:\s*'fill'/);
});

test('native output framebuffer preserves the decoded video aspect ratio within transfer bounds', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /fitVideoOutputWithinBounds\(/);
  assert.match(native, /getDisplayDimensions\(mpv, sourceWidth, sourceHeight\)/);
  assert.match(native, /readPair\("dwidth", "dheight"\)/);
  assert.match(native, /readPair\("video-params\/dw", "video-params\/dh"\)/);
  assert.match(native, /readPair\("width", "height"\)/);
  assert.match(native, /framebuffer\.resize\(gl, outputSize\.first, outputSize\.second, preferFloatFramebuffer\)/);
  assert.match(native, /video-output-size/);
});

test('native poster frames also preserve the source aspect ratio', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /posterOutputConfigured/);
  assert.match(native, /fitVideoOutputWithinBounds\(videoWidth, videoHeight, options\.width, options\.height\)/);
  assert.match(native, /aspect-correct native poster framebuffer/);
});

test('native frame presentation uploads the transferred buffer into a persistent WebGL texture', () => {
  const script = read('scripts/script.js');
  assert.match(script, /new Uint8ClampedArray\(frame\.data\)/);
  assert.match(script, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, width, height, gl\.RGBA, gl\.UNSIGNED_BYTE, data\)/);
  assert.match(script, /textureWidth !== width \|\| textureHeight !== height/);
  assert.doesNotMatch(script, /nativeFrameImageData\.data\.set/);
});

test('additional MPV-oriented video extensions are recognized by library scanning and file picker', () => {
  const media = read('scripts/media-support.js');
  const html = read('index.html');
  for (const extension of ['264', '265', '266', 'fli', 'flc', 'r3d', 'smk', 'mod', 'tod', 'rec', 'yuv']) {
    assert.match(media, new RegExp(`'${extension}'`));
    assert.match(html, new RegExp(`\\.${extension}(?:[,\"]|$)`));
  }
});

test('Picture-in-Picture keeps native MPV in its independent desktop window and uses Chromium PiP for HTML video', () => {
  const script = read('scripts/script.js');
  const start = script.indexOf('async function togglePiP()');
  const endMatch = /\r?\n\/\* =+\r?\n   FOLDER INPUT/.exec(script.slice(start));
  const end = endMatch ? start + endMatch.index : -1;
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const toggle = script.slice(start, end);
  assert.match(toggle, /if \(nativeMpvActive\)/);
  assert.match(toggle, /desktop\.setNativePictureInPicture\(!desktopPiPActive\)/);
  assert.match(toggle, /video\.requestPictureInPicture\(\)/);
  assert.doesNotMatch(toggle, /documentPictureInPicture\.requestWindow/);
  assert.doesNotMatch(toggle, /desktop\.startEmbeddedMpv\(filePath, startTime/);
  assert.match(toggle, /document\.exitPictureInPicture\(\)/);
});
test('native PiP can resize freely within the active display work area and persists user bounds', () => {
  const main = read('desktop/main.cjs');
  const pip = read('desktop/pip.html');
  const renderer = read('desktop/pip.js');
  assert.match(main, /function getPipSizeLimits\(referenceBounds\)/);
  assert.match(main, /maxWidth:\s*Math\.max\(1, area\.width\)/);
  assert.match(main, /maxHeight:\s*Math\.max\(1, area\.height\)/);
  assert.match(main, /function loadStoredPipBounds\(\)/);
  assert.match(main, /function persistPipBounds\(bounds\)/);
  assert.match(main, /fs\.renameSync\(temporaryPath, filePath\)/);
  assert.match(main, /pip-window\.json/);
  assert.doesNotMatch(main, /PIP_MAX_WIDTH|PIP_MAX_HEIGHT/);
  for (const direction of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    assert.match(pip, new RegExp(`data-pip-resize="${direction}"`));
  }
  assert.match(renderer, /window\.auraPip\?\.startResize\(direction, event\.screenX, event\.screenY\)/);
  assert.match(renderer, /window\.auraPip\?\.updateResize\(event\.screenX, event\.screenY\)/);
});

test('native video output dimension probing is throttled while codecs publish stream metadata', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /auto nextOutputProbe = nextState/);
  assert.match(native, /nextOutputProbe = now \+ std::chrono::milliseconds\(100\)/);
  assert.match(native, /instead of every 2 ms SDL loop iteration/);
});

test('stylesheet cache key matches the current desktop UI release', () => {
  const html = read('index.html');
  const version = JSON.parse(read('package.json')).version;
  assert.match(html, new RegExp(`style\\.css\\?v=${version.replaceAll('.', '\\.')}`));
});


test('native renderer prefers display aspect dimensions for anamorphic and rotated sources', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /mpv\x27s display dimensions[\s\S]*?sample-aspect-ratio and display transforms/);
  assert.match(native, /getDisplayDimensions\(mpv, videoWidth, videoHeight\)/);
});

test('JavaScript and CSS cache keys track the current UI version', () => {
  const html = read('index.html');
  const version = JSON.parse(read('package.json')).version;
  const escapedVersion = version.replaceAll('.', '\\.');
  assert.match(html, new RegExp(`style\\.css\\?v=${escapedVersion}`));
  assert.match(html, new RegExp(`script\\.js\\?v=${escapedVersion}`));
});
