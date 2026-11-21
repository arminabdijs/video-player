'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { APP_ID, SIZES, desktopQuote, integrate } = require('../scripts/integrate-linux-desktop.cjs');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Electron Linux desktop identity matches the reverse-DNS launcher ID', () => {
  assert.equal(pkg.desktopName, APP_ID);
  assert.equal(pkg.build.appId, APP_ID);
  assert.equal(pkg.build.linux.syncDesktopName, true);
  assert.equal(pkg.build.linux.desktop.entry.StartupWMClass, APP_ID);
  assert.equal(pkg.build.linux.desktop.entry.Icon, APP_ID);
  const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
  assert.match(main, /app\.setDesktopName\('info\.arminabdi\.aura-player'\)/);
});

test('desktop Exec safely quotes paths with spaces and special characters', () => {
  assert.equal(desktopQuote('/home/test/Aura Player/$media.appimage'), '"/home/test/Aura Player/\\$media.appimage"');
});

test('Linux integration installs one stable desktop file and all Hicolor icon sizes', {
  skip: process.platform !== 'linux' ? 'Linux desktop integration can only run on Linux.' : false,
}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-desktop-test-'));
  const fakeImage = path.join(temp, 'Aura Player.AppImage');
  fs.writeFileSync(fakeImage, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const dataHome = path.join(temp, 'xdg-data');
  try {
    const result = integrate(fakeImage, { ...process.env, XDG_DATA_HOME: dataHome });
    assert.equal(path.basename(result.desktopFile), `${APP_ID}.desktop`);
    const desktop = fs.readFileSync(result.desktopFile, 'utf8');
    assert.match(desktop, new RegExp(`^Icon=${APP_ID}$`, 'm'));
    assert.match(desktop, new RegExp(`^StartupWMClass=${APP_ID}$`, 'm'));
    assert.match(desktop, /^Exec=".*Aura Player\.AppImage" %U$/m);
    for (const size of SIZES) {
      assert.ok(fs.existsSync(path.join(dataHome, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${APP_ID}.png`)));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
