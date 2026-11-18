const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const layer = css.slice(css.lastIndexOf('AURA 2.2.4 — ORIGINAL-SHAPE GLASS POPUPS'));

test('subtitle and speed use the original compact dimensions with real glass material', () => {
  assert.match(layer, /\.subtitle-menu\s*\{[^}]*width:\s*260px\s*!important/s);
  assert.match(layer, /\.speed-menu\s*\{[^}]*width:\s*250px\s*!important/s);
  assert.match(layer, /backdrop-filter:\s*blur\(24px\)\s+saturate\(145%\)/);
  assert.match(layer, /-webkit-backdrop-filter:\s*blur\(24px\)\s+saturate\(145%\)/);
});

test('subtitle inner sections remain flat instead of nested floating cards', () => {
  assert.match(layer, /\.subtitle-menu \.subtitle-file\s*\{[^}]*background:\s*transparent\s*!important/s);
  assert.match(layer, /\.subtitle-menu \.subtitle-file\s*\{[^}]*border:\s*0\s*!important/s);
  assert.match(layer, /\.subtitle-menu \.embedded-subtitle-track\s*\{[^}]*border:\s*0\s*!important/s);
  assert.match(layer, /\.subtitle-menu \.subtitle-settings-group\s*\{[^}]*background:\s*transparent\s*!important/s);
});

test('all 2.2.3 subtitle and speed controls remain in the document', () => {
  for (const id of ['subtitleUploadBtn','subtitleToggle','subBgToggleBtn','subtitleSize','subtitlePosition','embeddedSubtitleTracks','speedInput','speedRange','applySpeed']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
});
