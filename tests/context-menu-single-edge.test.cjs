const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const marker = 'AURA 2.2.13 — SINGLE CONTEXT-MENU EDGE';
const patchStart = css.lastIndexOf(marker);
const patch = patchStart >= 0 ? css.slice(patchStart) : '';

test('context menu has exactly one explicit outer rim', () => {
  assert.ok(patch, 'missing 2.2.13 single-edge override');
  assert.match(patch, /\.player-context-menu\s*\{[^}]*border:\s*1px solid rgba\(232, 226, 244, \.18\)\s*!important/s);
  assert.match(patch, /\.player-context-menu\s*\{[^}]*box-shadow:\s*0 20px 54px rgba\(0, 0, 0, \.38\)\s*!important/s);
  assert.doesNotMatch(patch, /inset\s+0\s+/i, 'the shell must not add an inset rim');
});

test('context menu reflection pseudo-elements cannot draw a second edge', () => {
  assert.match(patch, /\.player-context-menu::before,[\s\S]*?\.player-context-menu::after\s*\{[^}]*content:\s*none\s*!important/s);
  assert.match(patch, /\.player-context-menu::before,[\s\S]*?\.player-context-menu::after\s*\{[^}]*display:\s*none\s*!important/s);
});
