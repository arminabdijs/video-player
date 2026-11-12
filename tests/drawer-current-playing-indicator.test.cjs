const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'scripts', 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('playlist drawer has a dedicated now-playing summary', () => {
  assert.match(html, /id="drawerNowPlaying"[^>]*hidden[^>]*aria-live="polite"/);
  assert.match(html, /id="drawerPlaybackLabel"/);
  assert.match(html, /id="drawerPlaybackName"/);
});

test('playlist rows expose the active file and a visible state label', () => {
  assert.match(js, /row\.dataset\.playlistIndex\s*=\s*String\(globalIndex\)/);
  assert.match(js, /state\.className\s*=\s*'drawer-v-state'/);
  assert.match(js, /row\.setAttribute\('aria-current', isCurrent \? 'true' : 'false'\)/);
  assert.match(js, /row\.classList\.toggle\('is-playing', rowIsPlaying\)/);
});

test('drawer indicator follows play, pause and playing events', () => {
  for (const eventName of ['play', 'pause', 'playing', 'ended']) {
    const eventBlock = js.match(new RegExp(`video\\.addEventListener\\('${eventName}', \\(\\) => \\{([\\s\\S]*?)\\n\\}\\);`));
    assert.ok(eventBlock, `missing ${eventName} listener`);
    assert.match(eventBlock[1], /syncDrawerPlaybackState\(\)/);
  }
});

test('drawer current-playing UI has responsive, readable status styling', () => {
  const marker = 'AURA 2.2.14 — CURRENTLY PLAYING DRAWER STATE';
  const section = css.slice(css.lastIndexOf(marker));
  assert.ok(section.includes('.drawer-now-playing'));
  assert.ok(section.includes('.drawer-v-item.active'));
  assert.ok(section.includes('.drawer-v-state'));
  assert.match(section, /text-overflow:\s*ellipsis/);
  assert.match(section, /prefers-reduced-motion/);
});
