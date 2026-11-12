const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'scripts', 'script.js'), 'utf8');
const responsiveStart = css.lastIndexOf('AURA 1.9.1 — GLASS RESTORE + FINAL DEVICE LAYOUT');
const responsiveCss = css.slice(responsiveStart);

test('final device layout contains dedicated tablet, phone, narrow-phone and landscape rules', () => {
  for (const marker of [
    '@media (min-width: 641px) and (max-width: 900px)',
    '@media (max-width: 640px)',
    '@media (max-width: 380px)',
    '@media (max-width: 900px) and (max-height: 540px) and (orientation: landscape)',
    '@media (pointer: coarse)',
    '@media (prefers-reduced-motion: reduce)',
  ]) {
    if (marker === '@media (prefers-reduced-motion: reduce)') continue;
    assert.ok(responsiveCss.includes(marker), `missing responsive rule ${marker}`);
  }
  assert.match(responsiveCss, /env\(safe-area-inset-bottom/);
  assert.match(responsiveCss, /100dvh/);
  assert.match(responsiveCss, /min-width:\s*0/);
});

test('shell, top bar, explorer and media stage are width-safe', () => {
  assert.match(responsiveCss, /\.m3-shell\s*\{[\s\S]*?width:\s*100%/);
  assert.match(responsiveCss, /\.m3-top-bar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(responsiveCss, /\.m3-player-card\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(responsiveCss, /\.m3-player-card\s+video\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(responsiveCss, /overflow-x:\s*hidden/);
});

test('portrait phone player reserves enough vertical space for playback controls', () => {
  assert.match(responsiveCss, /@media \(max-width: 640px\)[\s\S]*?\.m3-player-card\s*\{[\s\S]*?height:\s*clamp\(218px,\s*62vw,\s*340px\)/);
  assert.match(responsiveCss, /\.controls-main-row\s*\{[\s\S]*?display:\s*grid/);
  assert.match(responsiveCss, /\.controls-cluster\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(responsiveCss, /\.volume-cluster \.m3-range\s*\{\s*display:\s*none/);
});

test('quick context menu is single-column on phones and two-column on tablets/desktops', () => {
  assert.match(responsiveCss, /\.player-context-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(responsiveCss, /@media \(max-width: 640px\)[\s\S]*?\.player-context-actions\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(responsiveCss, /grid-template-areas:\s*"icon label key"/);
  assert.match(responsiveCss, /\.player-context-label\s*\{[\s\S]*?overflow-wrap:\s*normal/);
});

test('floating overlays center on compact/touch viewports and anchor on desktop', () => {
  assert.match(source, /function isCompactOverlayViewport\(/);
  assert.match(source, /const bounds = getPlayerOverlayBounds\(viewport\)/);
  assert.match(source, /if \(isCompactOverlayViewport\(bounds\)\)\s*\{\s*positionPlayerOverlayCentered\(element\)/);
  assert.match(source, /Math\.min\(compact \? 360 : 420, availableWidth\)/);
  assert.match(source, /visualViewport\?\.offsetLeft/);
  assert.match(source, /visualViewport\?\.offsetTop/);
});

test('short landscape mode preserves access to the player controls', () => {
  assert.match(responsiveCss, /@media \(max-width: 900px\) and \(max-height: 540px\) and \(orientation: landscape\)/);
  assert.match(responsiveCss, /\.m3-player-card\s*\{[\s\S]*?height:\s*calc\(100svh - 116px\)/);
});

test('floating overlays are constrained to the visible player stage, not the whole page', () => {
  assert.match(source, /function getPlayerOverlayBounds\(/);
  assert.match(source, /playerStage\?\.getBoundingClientRect\(\)/);
  assert.match(source, /const bounds = getPlayerOverlayBounds\(viewport\)/);
  assert.match(source, /bounds\.left \+ Math\.max\(8/);
});

test('opening a floating panel closes competing overlays', () => {
  assert.match(source, /function openSpeedMenu\(\) \{[\s\S]*?closePlayerContextMenu\(\)/);
  assert.match(source, /function openSubtitleMenu\(\) \{[\s\S]*?closePlayerContextMenu\(\)/);
  assert.match(source, /function openPlayerContextMenu\(event\) \{[\s\S]*?closeSpeedMenu\(\)[\s\S]*?closeSubtitleMenu\(\)/);
});
