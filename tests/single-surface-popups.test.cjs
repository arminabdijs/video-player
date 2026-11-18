const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marker = 'AURA 2.2.12 — FIXED GLASS SURFACE ARCHITECTURE';
const layer = css.slice(css.lastIndexOf(marker));

test('context popup keeps unframed command rows', () => {
  assert.ok(layer.includes('.player-context-menu .player-context-item'));
  assert.match(layer, /\.player-context-menu \.player-context-item,[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(layer, /\.player-context-menu \.player-context-item,[\s\S]*?border-color:\s*transparent\s*!important/);
});

test('subtitle file and track rows do not create nested glass cards', () => {
  assert.match(layer, /\.subtitle-menu \.subtitle-file[\s\S]*?border: 0 !important/);
  assert.match(layer, /\.subtitle-menu \.embedded-subtitle-section[\s\S]*?background: transparent !important/);
  assert.match(layer, /\.subtitle-menu \.embedded-subtitle-track[\s\S]*?background: transparent !important/);
});

test('all floating shells have no decorative border or inset frame', () => {
  for (const selector of ['.player-context-menu', '.subtitle-menu', '.speed-menu', '.player-keyboard-help', '.player-drawer-overlay']) {
    assert.ok(layer.includes(selector), `missing floating shell: ${selector}`);
  }
  assert.match(layer, /\.subtitle-menu,[\s\S]*?\.seek-tooltip\s*\{[\s\S]*?border:\s*0\s*!important/);
  assert.match(layer, /\.subtitle-menu::after,[\s\S]*?\.seek-tooltip::after\s*\{[\s\S]*?content:\s*none\s*!important/);
});

test('all functional subtitle controls remain in the document', () => {
  for (const id of ['subtitleUploadBtn', 'subtitleToggle', 'subBgToggleBtn', 'subtitleSize', 'subtitlePosition', 'embeddedSubtitleTracks', 'speedInput', 'speedRange', 'applySpeed']) {
    assert.ok(html.includes(`id="${id}"`), `missing control ${id}`);
  }
});
