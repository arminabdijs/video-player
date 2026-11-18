'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const currentBuilder = fs.readFileSync(path.join(root, 'scripts/build-current-installer.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/desktop-release.yml'), 'utf8');
// The source archive may be extracted into a pre-created directory, leaving
// the documentation one level above the app root. Search a small, bounded
// number of ancestors instead of failing the installer build for this layout.
function findInstallerGuide() {
  let directory = root;
  for (let depth = 0; depth <= 3; depth += 1) {
    const candidate = path.join(directory, 'README-INSTALLERS.md');
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
    directory = path.dirname(directory);
  }
  return null;
}
const installerGuide = findInstallerGuide();

test('one current-host command is available for Linux and Windows installers', () => {
  assert.equal(pkg.version, '2.5.13');
  assert.equal(pkg.scripts['desktop:dist:current'], 'node scripts/build-current-installer.cjs');
  assert.match(currentBuilder, /process\.platform === 'linux'/);
  assert.match(currentBuilder, /desktop:dist:linux/);
  assert.match(currentBuilder, /process\.platform === 'win32'/);
  assert.match(currentBuilder, /Build-Windows-Setup\.ps1/);
  assert.ok(currentBuilder.includes('AppImage|deb'));
  assert.match(currentBuilder, /Setup-.*x64/);
});

test('Linux release creates AppImage and DEB; Windows release creates NSIS Setup only', () => {
  assert.deepEqual(pkg.build.linux.target.map((x) => x.target), ['AppImage', 'deb']);
  assert.deepEqual(pkg.build.win.target.map((x) => x.target), ['nsis']);
  assert.equal(pkg.build.win.artifactName, '${productName}-Setup-${version}-${arch}.${ext}');
  assert.equal(pkg.scripts['desktop:dist:windows:setup'], 'electron-builder --win nsis');
});

test('desktop release workflow prepares native Linux tools and checksum-verifies Windows SDK bundle', () => {
  assert.match(workflow, /libmpv-dev/);
  assert.match(workflow, /libsdl2-dev/);
  assert.match(workflow, /cmake/);
  assert.match(workflow, /AURA_MPV_SDK_URL/);
  assert.match(workflow, /AURA_MPV_SDK_SHA256/);
  assert.match(workflow, /Get-FileHash/);
  assert.match(workflow, /Build-Windows-Setup\.ps1/);
  assert.match(workflow, /upload-artifact/);
});

test('installer guide documents both native build hosts and output formats when present', (t) => {
  if (installerGuide === null) {
    t.skip('README-INSTALLERS.md is documentation only and is not required to build installers.');
    return;
  }
  assert.match(installerGuide, /AppImage/);
  assert.match(installerGuide, /\.deb/);
  assert.match(installerGuide, /Setup-2\.5\.13-x64\.exe/);
  assert.match(installerGuide, /npm run desktop:dist:current/);
  assert.match(installerGuide, /Build each target on its native operating system/);
});
