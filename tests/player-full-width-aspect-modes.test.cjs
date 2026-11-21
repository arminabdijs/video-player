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

test('native frame presentation wraps the transferred buffer without an extra byte-array copy', () => {
  const script = read('scripts/script.js');
  assert.match(script, /new ImageData\(source, frame\.width, frame\.height, \{ colorSpace: 'srgb' \}\)/);
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

test('the Picture-in-Picture control opens a real desktop window for native Canvas playback', () => {
  const script = read('scripts/script.js');
  const main = read('desktop/main.cjs');
  const pipHtml = read('desktop/pip.html');
  const pipRenderer = read('desktop/pip.js');
  const pipPreload = read('desktop/pip-preload.cjs');
  const css = read('css/style.css');

  assert.match(script, /if \(nativeMpvActive\) \{[\s\S]*?desktop\.setNativePictureInPicture\(!desktopPiPActive\)/);
  assert.match(script, /onNativePictureInPictureState/);
  assert.doesNotMatch(script, /playerStage\.classList\.toggle\('is-picture-in-picture'\)/);
  assert.match(main, /new BrowserWindow\(\{[\s\S]*?alwaysOnTop: true/);
  assert.match(main, /setAlwaysOnTop\(true, 'screen-saver'\)/);
  assert.match(pipHtml, /id="pipCanvas"/);
  assert.match(pipRenderer, /context\.putImageData/);
  assert.match(pipRenderer, /toggle-pause/);
  assert.match(main, /PIP_RESIZE_DIRECTIONS/);
  assert.match(main, /beginNativePipResize/);
  assert.match(main, /updateNativePipResize/);
  assert.match(main, /getInitialPipBounds\(\)/);
  assert.match(main, /rememberPipBounds\(window\)/);
  assert.match(pipPreload, /aura:pip-resize-start/);
  assert.match(pipPreload, /aura:pip-resize-update/);
  assert.match(pipPreload, /aura:pip-resize-end/);
  for (const direction of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    assert.match(pipHtml, new RegExp(`data-pip-resize="${direction}"`));
  }
  assert.match(pipHtml, /-webkit-app-region: drag/);
  assert.match(pipHtml, /cursor: move/);
  assert.match(pipRenderer, /setPointerCapture/);
  assert.match(pipRenderer, /updateResize\(event\.screenX, event\.screenY\)/);
  assert.match(script, /playerStage\?\.classList\.toggle\('desktop-native-pip-active', desktopPiPActive\)/);
  assert.match(script, /if \(!nativeMpvActive \|\| desktopPiPActive \|\| nativeResizeRaf/);
  assert.match(css, /\.m3-player-card\.desktop-native-pip-active::after/);
  assert.match(css, /background: rgba\(0, 0, 0, \.72\)/);
  assert.match(script, /video\.requestPictureInPicture\(\)/);
});


test('native video output dimension probing is throttled while codecs publish stream metadata', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /auto nextOutputProbe = nextState/);
  assert.match(native, /nextOutputProbe = now \+ std::chrono::milliseconds\(100\)/);
  assert.match(native, /instead of every 2 ms SDL loop iteration/);
});

test('stylesheet cache key matches the current desktop UI release', () => {
  const html = read('index.html');
  assert.match(html, /style\.css\?v=2\.5\.14/);
});


test('native renderer prefers display aspect dimensions for anamorphic and rotated sources', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /mpv\x27s display dimensions[\s\S]*?sample-aspect-ratio and display transforms/);
  assert.match(native, /getDisplayDimensions\(mpv, videoWidth, videoHeight\)/);
});

test('JavaScript and CSS cache keys track the current UI version', () => {
  const html = read('index.html');
  assert.match(html, /style\.css\?v=2\.5\.14/);
  assert.match(html, /script\.js\?v=2\.5\.14/);
});
