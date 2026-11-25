'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const buildScript = fs.readFileSync(path.join(root, 'scripts/Build-Windows-Setup.ps1'), 'utf8');
const prepareScript = fs.readFileSync(path.join(root, 'scripts/Prepare-Windows-Native.ps1'), 'utf8');

test('Windows release produces an NSIS Setup only, not a portable build', () => {
  assert.equal(pkg.version, '2.5.25');
  assert.deepEqual(pkg.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(pkg.build.win.artifactName, '${productName}-Setup-${version}-${arch}.${ext}');
  assert.match(pkg.scripts['desktop:dist:windows'], /Build-Windows-Setup\.ps1/);
  assert.equal(pkg.scripts['desktop:dist:windows:setup'], 'electron-builder --win nsis --publish never');
  assert.doesNotMatch(pkg.scripts['desktop:dist:windows'], /portable/i);
});

test('NSIS setup installs the app and creates normal Windows shortcuts', () => {
  const nsis = pkg.build.nsis;
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.perMachine, true);
  assert.equal(nsis.allowElevation, true);
  assert.equal(nsis.allowToChangeInstallationDirectory, true);
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);
  assert.equal(nsis.shortcutName, 'Aura Player');
  assert.equal(nsis.runAfterFinish, true);
  assert.equal(nsis.deleteAppDataOnUninstall, false);
  assert.ok(pkg.build.win.fileAssociations.some((association) => association.ext.includes('mp4') && association.ext.includes('mkv')));
  assert.ok(fs.existsSync(path.join(root, pkg.build.win.icon)));
});

test('PowerShell builder validates target OS and native SDK before packaging', () => {
  assert.match(buildScript, /Windows_NT/);
  assert.match(buildScript, /Visual Studio/);
  assert.match(buildScript, /MPV_INCLUDE_DIR/);
  assert.match(buildScript, /MPV_LIB/);
  assert.match(buildScript, /MPV_RUNTIME_DIR/);
  assert.match(buildScript, /SDL2_DIR/);
  assert.match(buildScript, /codec:diagnose/);
  assert.match(buildScript, /desktop:dist:windows:setup/);
  assert.match(buildScript, /\*-Setup-\*-x64\.exe/);
});

test('MSYS2 package metadata is queried through the MSYS2 shell helper, not native PowerShell PATH', () => {
  assert.match(prepareScript, /Get-Command msys2/);
  assert.match(prepareScript, /& msys2 -c 'pacman -Q mingw-w64-ucrt-x86_64-SDL2'/);
  assert.doesNotMatch(prepareScript, /& pacman -Q/);
});

test('Windows native build uses the exact UCRT64 prefix returned by setup-msys2', () => {
  assert.match(prepareScript, /\$env:MSYS2_LOCATION/);
  assert.match(prepareScript, /Join-Path \$msys2Root 'ucrt64'/);
  assert.match(prepareScript, /Join-Path \$ucrtPrefix 'bin'/);
  assert.match(prepareScript, /\$env:GITHUB_PATH/);
  assert.doesNotMatch(prepareScript, /\$gccPath = \(Get-Command gcc\)\.Source/);
});
