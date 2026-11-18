const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const marker = 'AURA 2.2.12 — FIXED GLASS SURFACE ARCHITECTURE';
const layer = css.slice(css.lastIndexOf(marker));

test('subtitle panel uses a single borderless outer shell', () => {
  assert.match(layer, /\.subtitle-menu,[\s\S]*?\.seek-tooltip\s*\{[\s\S]*?border:\s*0\s*!important/);
  assert.match(layer, /\.subtitle-menu::after[\s\S]*?content:\s*none\s*!important/);
});

test('subtitle inner sections and options are flat and filter-free', () => {
  for (const selector of ['.subtitle-menu .subtitle-upload', '.subtitle-menu .subtitle-file', '.subtitle-menu .subtitle-option', '.subtitle-menu .embedded-subtitle-section', '.subtitle-menu .embedded-subtitle-track']) {
    assert.ok(layer.includes(selector), `missing ${selector}`);
  }
  assert.match(layer, /\.subtitle-menu \*[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/);
});

test('all functional subtitle control IDs remain unchanged', () => {
  for (const id of ['subtitleMenu','closeSubtitle','subtitleUploadBtn','embeddedSubtitleSection','embeddedSubtitleCount','embeddedSubtitleTracks','embeddedSubtitleMessage','subtitleFile','subtitleFileName','subtitleStatus','removeSubtitle','subtitleToggle','subBgToggleBtn','subtitleSizeValue','subtitleSize','subtitlePositionValue','subtitlePosition']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
});
