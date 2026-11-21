'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const currentBuilder = fs.readFileSync(path.join(root, 'scripts/build-current-installer.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/windows-installer.yml'), 'utf8');
const sdkPreparation = fs.readFileSync(path.join(root, 'scripts/Prepare-Windows-SDK.ps1'), 'utf8');
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

test('Windows release workflow builds the pinned offline native runtime and uploads one Setup artifact', () => {
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /Prepare-Windows-SDK\.ps1/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run native:build/);
  assert.match(workflow, /npm run codec:diagnose/);
  assert.match(workflow, /desktop:dist:windows:setup/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(sdkPreparation, /libmpv-v0\.42\.0-x86_64-w64-mingw32-lgpl\.zip/);
  assert.match(sdkPreparation, /8e5f77430efc53ef175804ba6618527e3af0448a0dcabf04d3cc72659d1a6fce/);
  assert.match(sdkPreparation, /Get-FileHash/);
  assert.match(sdkPreparation, /SDL2-devel-2\\.32\\.10-VC\\.zip/);
  assert.match(sdkPreparation, /af347939395a58b365846aaea27391e69f9ec9d4dd650d6ac40802159b418a6e/);
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
