const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'script.js'), 'utf8');

test('floating overlay coordinates override legacy responsive left/right !important rules', () => {
  assert.match(js, /setProperty\('left',[\s\S]{0,140}'important'\)/);
  assert.match(js, /setProperty\('right', 'auto', 'important'\)/);
  assert.match(js, /setProperty\('top',[\s\S]{0,140}'important'\)/);
  assert.match(js, /setProperty\('bottom', 'auto', 'important'\)/);
});

test('overlay dimensions are clamped to the available player-stage bounds', () => {
  assert.match(js, /setProperty\('width',[\s\S]{0,180}availableWidth[\s\S]{0,80}'important'\)/);
  assert.match(js, /setProperty\('max-width',[\s\S]{0,100}availableWidth[\s\S]{0,80}'important'\)/);
  assert.match(js, /setProperty\('max-height',[\s\S]{0,100}availableHeight[\s\S]{0,80}'important'\)/);
});

test('subtitle background switch exposes its current state to assistive technology', () => {
  assert.match(js, /const active = subBgToggleBtn\.classList\.toggle\('active'\);\s*subBgToggleBtn\.setAttribute\('aria-pressed', String\(active\)\);/);
});
