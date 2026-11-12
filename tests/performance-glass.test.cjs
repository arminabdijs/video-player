const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

 test('buffer range scanning is separated from the timeupdate hot path', () => {
  const timeUpdate = source.match(/video\.addEventListener\('timeupdate',[\s\S]*?\n\}\);/);
  assert.ok(timeUpdate);
  assert.match(timeUpdate[0], /updateProgressThrottled\(\)/);
  assert.match(timeUpdate[0], /if \(subtitleEnabled\) updateSubtitles\(\)/);
  assert.doesNotMatch(timeUpdate[0], /updateBufferedProgress/);
  assert.match(source, /video\.addEventListener\('progress',[\s\S]*?updateBufferedProgress\(\)/);
 });

test('timeline updates are coalesced and adaptive at high playback rates', () => {
  assert.match(source, /function getProgressUiInterval\(\)/);
  assert.match(source, /currentPlaybackRate >= EXTREME_SPEED_RATE/);
  assert.match(source, /window\.requestAnimationFrame\(/);
  assert.match(source, /if \(currentTime && currentLabel !== lastProgressLabel\)/);
});

test('subtitle binary search is skipped while the active cue remains valid', () => {
  assert.match(source, /const activeCue = currentSubtitleIndex >= 0 \? subtitles\[currentSubtitleIndex\] : null/);
  assert.match(source, /time >= activeCue\.start && time < activeCue\.end/);
});

test('all application popups share the glass surface system', () => {
  for (const selector of ['.subtitle-menu', '.speed-menu', '.player-context-menu', '.player-keyboard-help', '.player-drawer-overlay', '.player-osd', '.player-status', '.seek-tooltip']) {
    assert.ok(css.includes(selector), `missing glass selector ${selector}`);
  }
  assert.match(css, /backdrop-filter:\s*blur\(var\(--aura-glass-blur\)\)/);
  assert.match(css, /AURA 1\.9\.1 — GLASS RESTORE/);
  assert.match(css, /background:[\s\S]*?var\(--aura-glass-bg\) !important/);
  assert.match(css, /html\.aura-fast-playback[\s\S]*?--aura-glass-blur:\s*12px/);
  assert.match(css, /html\.aura-extreme-playback[\s\S]*?--aura-glass-blur:\s*8px/);
  assert.match(source, /document\.documentElement\.classList\.toggle\('aura-fast-playback'/);
  assert.match(source, /document\.documentElement\.classList\.toggle\('aura-extreme-playback'/);
});

test('pitch preservation stays enabled at every playback rate', () => {
  const profile = source.match(/function applyPlaybackPerformanceProfile\(value\) \{[\s\S]*?\n\}/);
  assert.ok(profile, 'playback performance profile must exist');
  assert.match(profile[0], /for \(const property of \['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch'\]\)/);
  assert.match(profile[0], /video\[property\] = true/);
  assert.doesNotMatch(profile[0], /preservePitch\s*=\s*speed\s*</);

  const fakeVideo = { preservesPitch: false, mozPreservesPitch: false, webkitPreservesPitch: false };
  const fakeClassList = { toggle() {} };
  const applyProfile = vm.runInNewContext(`(${profile[0]})`, {
    cleanSpeed: (value) => value,
    playerStage: { classList: fakeClassList },
    document: { documentElement: { classList: fakeClassList } },
    video: fakeVideo,
    EXTREME_SPEED_RATE: 8,
  });
  for (const rate of [1, 4, 4.5, 6, 8, 12, 16]) {
    applyProfile(rate);
    assert.equal(fakeVideo.preservesPitch, true, `standard pitch preservation disabled at ${rate}x`);
    assert.equal(fakeVideo.mozPreservesPitch, true, `Firefox pitch preservation disabled at ${rate}x`);
    assert.equal(fakeVideo.webkitPreservesPitch, true, `WebKit pitch preservation disabled at ${rate}x`);
  }
  assert.match(source, /applyPlaybackPerformanceProfile\(currentPlaybackRate\)/);
});

test('obsolete high-speed pitch-disable notice and threshold have been removed', () => {
  assert.doesNotMatch(source, /HIGH_SPEED_PITCH_BYPASS_RATE|highSpeedPitchHint/);
  assert.doesNotMatch(html, /highSpeedPitchHint|حفظ زیر و بمی صدا غیرفعال می‌شود/);
});

test('dead local-media loader markup and no-op wiring are removed', () => {
  assert.doesNotMatch(html, /videoLoader|video-loader|m3-circular-progress/);
  assert.doesNotMatch(source, /videoLoader|setLoading\(|resetControlsTimer|subtitleMatchScore|seekToPointerEvent/);
  assert.doesNotMatch(css, /\.video-loader|m3-circular-progress|@keyframes spin|speed-performance-note/);
  assert.doesNotMatch(html, /speed-performance-note/);
});

test('2.0 premium glass material is translucent, layered and shared by every floating surface', () => {
  assert.match(css, /AURA 2\.0\.0 — PREMIUM MULTI-LAYER FROSTED GLASS/);
  assert.match(css, /--aura-glass-bg:\s*rgba\(29, 24, 40, \.40\)/);
  assert.match(css, /--aura-glass-blur:\s*30px/);
  assert.match(css, /--aura-glass-saturate:\s*190%/);
  assert.match(css, /brightness\(1\.08\)/);
  assert.match(css, /\.player-context-menu::before[\s\S]*?linear-gradient\(118deg/);
  assert.match(css, /\.player-context-menu::after[\s\S]*?inset 0 1px 0/);
  for (const selector of ['.subtitle-menu', '.speed-menu', '.player-context-menu', '.player-keyboard-help', '.player-drawer-overlay', '.player-osd', '.player-status', '.seek-tooltip']) {
    assert.ok(css.includes(selector), `glass material missing from ${selector}`);
  }
});

test('glass remains visible at high playback rates with a gradual GPU-conscious blur reduction', () => {
  const premiumGlassLayer = css.slice(css.lastIndexOf('AURA 2.0.0 — PREMIUM MULTI-LAYER FROSTED GLASS'));
  assert.match(premiumGlassLayer, /html\.aura-fast-playback\s*\{[^}]*--aura-glass-blur:\s*23px/);
  assert.match(premiumGlassLayer, /html\.aura-extreme-playback\s*\{[^}]*--aura-glass-blur:\s*17px/);
});

test('glass panels expose an accessible reduced-transparency fallback', () => {
  assert.match(css, /@media \(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
});


test('2.1 glass material uses genuinely translucent surfaces with visible background sampling', () => {
  const finalLayer = css.slice(css.lastIndexOf('AURA 2.1.0 — TRUE TRANSLUCENT GLASS MATERIAL'));
  assert.match(finalLayer, /--aura-glass-bg:\s*rgba\(18, 21, 33, \.16\)/);
  assert.match(finalLayer, /--aura-glass-blur:\s*32px/);
  assert.match(finalLayer, /--aura-glass-saturate:\s*190%/);
  assert.match(finalLayer, /rgba\(255, 255, 255, \.27\)/);
  assert.match(finalLayer, /backdrop-filter:[\s\S]*?blur\(var\(--aura-glass-blur\)\)/);
});

test('fast playback no longer injects opaque .89/.91 glass variables into in-stage overlays', () => {
  const finalLayer = css.slice(css.lastIndexOf('AURA 2.1.0 — TRUE TRANSLUCENT GLASS MATERIAL'));
  assert.match(finalLayer, /\.m3-player-card\.is-fast-playback,[\s\S]*?--aura-glass-bg:\s*inherit !important/);
  assert.match(finalLayer, /html\.aura-fast-playback\s*\{[^}]*--aura-glass-bg:\s*rgba\(18, 21, 33, \.20\)/);
  assert.match(finalLayer, /html\.aura-extreme-playback\s*\{[^}]*--aura-glass-bg:\s*rgba\(18, 21, 33, \.24\)/);
  assert.doesNotMatch(finalLayer, /--aura-glass-bg:\s*rgba\(24, 22, 30, \.91\)/);
});

test('glass reflections and inner panes remain translucent and consistent across all popups', () => {
  const finalLayer = css.slice(css.lastIndexOf('AURA 2.1.0 — TRUE TRANSLUCENT GLASS MATERIAL'));
  for (const selector of ['.subtitle-menu', '.speed-menu', '.player-context-menu', '.player-keyboard-help', '.player-drawer-overlay', '.player-osd', '.player-status', '.seek-tooltip']) {
    assert.ok(finalLayer.includes(selector), `missing 2.1 glass surface ${selector}`);
  }
  assert.match(finalLayer, /\.player-context-menu::before[\s\S]*?linear-gradient\(112deg/);
  assert.match(finalLayer, /\.player-context-menu::after[\s\S]*?inset 0 1px 0/);
  assert.match(finalLayer, /\.player-context-item,[\s\S]*?--aura-glass-card-bg/);
});


test('legacy per-panel opaque glass variables are explicitly inherited from the root material', () => {
  const finalLayer = css.slice(css.lastIndexOf('AURA 2.1.0 — TRUE TRANSLUCENT GLASS MATERIAL'));
  const surfaceBlock = finalLayer.match(/\.subtitle-menu,[\s\S]*?--aura-glass-shadow:\s*inherit !important;/);
  assert.ok(surfaceBlock, 'all floating surfaces must inherit glass variables');
  assert.match(surfaceBlock[0], /--aura-glass-bg:\s*inherit !important/);
  assert.match(surfaceBlock[0], /--aura-glass-blur:\s*inherit !important/);
  assert.match(finalLayer, /\.m3-player-card\.is-fast-playback,[\s\S]*?--aura-glass-bg:\s*inherit !important/);
});

test('2.2 refined glass uses a restrained neutral palette and one panel edge', () => {
  const layer = css.slice(css.lastIndexOf('AURA 2.2.0 — REFINED GLASS + QUIET NEUTRAL UI'));
  assert.match(layer, /--aura-text-primary:\s*#E8E9EE/);
  assert.match(layer, /--aura-text-secondary:\s*#B8BBC5/);
  assert.match(layer, /--aura-accent:\s*#B7A6D5/);
  assert.match(layer, /--aura-glass-bg:\s*rgba\(25, 27, 36, \.64\)/);
  assert.match(layer, /\.subtitle-menu::after,[\s\S]*?content: none !important/);
});

test('speed and subtitle panels have dedicated hierarchy and responsive widths', () => {
  const layer = css.slice(css.lastIndexOf('AURA 2.2.0 — REFINED GLASS + QUIET NEUTRAL UI'));
  assert.match(layer, /\.speed-menu\s*\{[\s\S]*?width: min\(344px/);
  assert.match(layer, /\.subtitle-menu\s*\{[\s\S]*?width: min\(376px/);
  assert.match(layer, /\.subtitle-option\s*\{[\s\S]*?box-shadow: none !important/);
  assert.match(layer, /\.speed-current span\s*\{[\s\S]*?font-size: 38px/);
});
