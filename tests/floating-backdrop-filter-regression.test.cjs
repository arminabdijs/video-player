const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const marker = 'AURA 2.2.12 — FIXED GLASS SURFACE ARCHITECTURE';
const layer = css.slice(css.lastIndexOf(marker));

test('only floating shells may apply backdrop blur; descendants must not', () => {
  assert.match(layer, /\.subtitle-menu \*,[\s\S]*?\.player-drawer-overlay \*\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important/);
  assert.doesNotMatch(layer, /\.subtitle-menu \.subtitle-(?:option|switch-row|range-row)\s*\{[^}]*backdrop-filter:\s*blur/s);
});

test('all popup shells explicitly remove border, outline and inner pseudo frame', () => {
  assert.match(layer, /\.subtitle-menu,[\s\S]*?\.seek-tooltip\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?outline:\s*none\s*!important/);
  assert.match(layer, /\.subtitle-menu::after,[\s\S]*?\.seek-tooltip::after\s*\{[\s\S]*?content:\s*none\s*!important/);
});
