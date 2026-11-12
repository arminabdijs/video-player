const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const layer = css.slice(css.lastIndexOf('2.2.5 — one-surface floating UI'));

test('all floating windows use a single outer glass shell', () => {
  assert.ok(layer.length > 500);
  for (const selector of [
    '.player-context-menu', '.player-keyboard-help', '.speed-menu',
    '.subtitle-menu', '.player-drawer-overlay'
  ]) {
    assert.ok(layer.includes(selector), `missing floating shell ${selector}`);
  }
});

test('nested floating-panel rows do not create additional card frames', () => {
  for (const selector of [
    '.player-context-item', '.player-help-group', '.speed-input-wrap',
    '.drawer-v-item', '.subtitle-upload', '.subtitle-file',
    '.subtitle-option', '.embedded-subtitle-track'
  ]) {
    assert.ok(layer.includes(selector), `missing flattened inner surface ${selector}`);
  }
  assert.match(layer, /background-color: transparent;[\s\S]*?border-color: transparent;[\s\S]*?box-shadow: none;/);
});

test('floating popup shell borders remain isolated from inner rows', () => {
  assert.match(layer, /\.player-context-menu,[\s\S]*?\.player-drawer-overlay \{[\s\S]*?isolation: isolate;/);
  assert.match(layer, /\.player-context-menu > \*,[\s\S]*?\.player-drawer-overlay > \* \{[\s\S]*?box-shadow: none;/);
});
