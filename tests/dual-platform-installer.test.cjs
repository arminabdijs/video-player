'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const currentBuilder = fs.readFileSync(path.join(root, 'scripts/build-current-installer.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/desktop-release.yml'), 'utf8');
const windowsPrepare = fs.readFileSync(path.join(root, 'scripts/Prepare-Windows-Native.ps1'), 'utf8');
const windowsBuilder = fs.readFileSync(path.join(root, 'scripts/Build-Windows-Setup.ps1'), 'utf8');
const nativeBuilder = fs.readFileSync(path.join(root, 'scripts/build-native-engine.cjs'), 'utf8');
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
  assert.equal(pkg.scripts['desktop:dist:windows:setup'], 'electron-builder --win nsis --publish never');
});

test('Windows release workflow provisions an isolated native toolchain and verifies the SDK bundle', () => {
  assert.match(workflow, /name: Windows installer/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /mingw-w64-ucrt-x86_64-SDL2/);
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


test('Windows CI builds a verified self-contained runtime without installing build tools on the developer PC', () => {
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /msys2\/setup-msys2@v2/);
  assert.match(workflow, /AURA_MPV_SDK_SHA256/);
  assert.match(windowsPrepare, /Get-FileHash/);
  assert.match(windowsPrepare, /objdump/);
  assert.match(windowsPrepare, /Unresolved non-system DLL dependency/);
  assert.match(windowsPrepare, /System32/);
  assert.match(windowsPrepare, /2\.32\.10-1/);
  assert.match(nativeBuilder, /verifyWindowsExecutableDependencies/);
  assert.match(nativeBuilder, /unresolved runtime DLL imports/);
  assert.match(windowsBuilder, /Invoke-Npm @\('ci'/);
  assert.match(windowsBuilder, /AURA_WINDOWS_TOOLCHAIN/);
  assert.match(nativeBuilder, /runtimeLicenses/);
  assert.ok(fs.existsSync(path.join(root, 'THIRD-PARTY-NOTICES.md')));
  assert.match(workflow, /Aura-Player-Windows-Setup-x64/);
});
