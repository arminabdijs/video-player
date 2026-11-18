const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const layer = css.slice(css.lastIndexOf('AURA 2.2.2 — SUBTITLE PANEL REDESIGN'));

test('subtitle settings are grouped into source, display and appearance sections', () => {
  for (const name of ['subtitle-source-group', 'subtitle-settings-group', 'subtitle-appearance-group']) {
    assert.ok(new RegExp(`class=\"[^\"]*${name}[^\"]*\"`).test(html), `missing ${name}`);
  }
  assert.match(html, /منبع زیرنویس[\s\S]*?انتخاب فایل زیرنویس/);
  assert.match(html, /نمایش[\s\S]*?نمایش زیرنویس[\s\S]*?پس‌زمینه زیرنویس/);
  assert.match(html, /ظاهر و جایگاه[\s\S]*?اندازه متن[\s\S]*?فاصله از پایین/);
});

test('all existing subtitle control IDs remain intact for JavaScript behavior', () => {
  for (const id of ['subtitleMenu','closeSubtitle','subtitleUploadBtn','embeddedSubtitleSection','embeddedSubtitleCount','embeddedSubtitleTracks','embeddedSubtitleMessage','subtitleFile','subtitleFileName','subtitleStatus','removeSubtitle','subtitleToggle','subBgToggleBtn','subtitleSizeValue','subtitleSize','subtitlePositionValue','subtitlePosition']) {
    assert.ok(html.includes(`id="${id}"`), `missing control ${id}`);
  }
});

test('subtitle panel uses one glass shell and flat section rows', () => {
  assert.match(layer, /\.subtitle-menu\s*\{[\s\S]*?padding: 19px 20px 18px !important/);
  assert.match(layer, /\.subtitle-menu \.subtitle-file[\s\S]*?background: transparent !important/);
  assert.match(layer, /\.subtitle-menu \.subtitle-option[\s\S]*?border: 0 !important/);
  assert.match(layer, /\.subtitle-settings-group[\s\S]*?border-top: 1px solid var\(--subtitle-line\)/);
});

test('range controls have clear labels, values and mobile sizing', () => {
  assert.match(html, /subtitle-range-hints/);
  assert.match(layer, /\.subtitle-menu \.setting-range::-webkit-slider-thumb/);
  assert.match(layer, /@media \(max-width: 640px\)[\s\S]*?\.subtitle-menu/);
});
