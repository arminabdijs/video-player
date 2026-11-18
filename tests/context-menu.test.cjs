const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'script.js'), 'utf8');
const quickMenuStart = source.indexOf('function ensurePlayerContextMenu() {');
const quickMenuEnd = source.indexOf('function openPlayerContextMenu(event) {', quickMenuStart);
const helpStart = source.indexOf('function toggleKeyboardHelp(forceOpen = null) {');
const helpEnd = source.indexOf('function isPlayerControlTarget(target) {', helpStart);
const quickMenuSource = source.slice(quickMenuStart, quickMenuEnd);
const helpSource = source.slice(helpStart, helpEnd);

test('quick context menu keeps only frequent actions', () => {
  for (const action of ['toggle-play', 'backward', 'forward', 'mute', 'speed', 'aspect', 'subtitles', 'fullscreen']) {
    assert.match(quickMenuSource, new RegExp(`\\['${action}'`), `missing quick action: ${action}`);
  }
});

test('advanced actions are not mixed into the quick context menu', () => {
  for (const action of ['screenshot', 'pip', 'loop', 'random', 'next', 'previous']) {
    assert.doesNotMatch(quickMenuSource, new RegExp(`\\['${action}'`), `advanced action leaked into quick menu: ${action}`);
  }
});

test('quick menu provides a visible route to the complete shortcut reference', () => {
  assert.match(quickMenuSource, /نمایش همه میانبرها/);
  assert.match(quickMenuSource, /case 'all-shortcuts':\s+toggleKeyboardHelp\(true\)/);
});

test('complete shortcut reference is categorized and searchable', () => {
  for (const title of ['پخش و جابه‌جایی', 'صدا و سرعت پخش', 'تصویر و پنجره', 'فهرست پخش و حالت‌های پخش', 'کنترل با ماوس']) {
    assert.ok(helpSource.includes(title), `missing help category: ${title}`);
  }
  assert.match(helpSource, /type = 'search'/);
  assert.match(helpSource, /row\.dataset\.searchText/);
});


test('touch users have a visible quick-menu trigger in the player toolbar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="quickMenuBtn"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(source, /quickMenuBtn\?\.addEventListener\('click'/);
  assert.match(source, /quickMenuBtn\?\.setAttribute\('aria-expanded', 'true'\)/);
});
