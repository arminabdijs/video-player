const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marker = 'AURA 2.2.12 — FIXED GLASS SURFACE ARCHITECTURE';
const layer = css.slice(css.lastIndexOf(marker));

test('subtitle option rows explicitly disable nested backdrop filters', () => {
  assert.ok(layer.includes('.subtitle-menu *'));
  assert.match(layer, /-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(layer, /backdrop-filter:\s*none\s*!important/);
});

test('subtitle row wrappers and labels remain transparent with no card shadow', () => {
  for (const selector of [
    '.subtitle-menu .subtitle-settings-group',
    '.subtitle-menu .subtitle-switch-row',
    '.subtitle-menu .subtitle-range-row',
    '.subtitle-menu .subtitle-range-row > .option-label',
    '.subtitle-menu .subtitle-range-hints'
  ]) assert.ok(layer.includes(selector), `missing reset for ${selector}`);
  assert.match(layer, /background:\s*transparent\s*!important/);
  assert.match(layer, /background-image:\s*none\s*!important/);
  assert.match(layer, /box-shadow:\s*none\s*!important/);
});

test('visible slider tracks and switches remain styled controls', () => {
  assert.match(css, /\.subtitle-menu \.setting-range\s*\{[^}]*background:\s*linear-gradient/s);
  assert.match(css, /\.subtitle-menu \.switch\.active\s*\{/);
  assert.ok(html.includes('id="subtitleSize"'));
  assert.ok(html.includes('id="subtitlePosition"'));
});
