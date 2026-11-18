'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const LEGACY_LIBCRYPT_PATHS = Object.freeze([
  '/usr/lib64/libcrypt.so.1',
  '/lib64/libcrypt.so.1',
  '/usr/lib/x86_64-linux-gnu/libcrypt.so.1',
  '/lib/x86_64-linux-gnu/libcrypt.so.1',
  '/usr/lib/libcrypt.so.1',
  '/lib/libcrypt.so.1',
]);

function readLdconfigCache() {
  const result = spawnSync('ldconfig', ['-p'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout : '';
}

function hasLegacyLibcrypt({
  ldconfigOutput = readLdconfigCache(),
  existsSync = fs.existsSync,
  searchPaths = LEGACY_LIBCRYPT_PATHS,
} = {}) {
  if (/\blibcrypt\.so\.1\b/.test(ldconfigOutput)) return true;
  return searchPaths.some((candidate) => existsSync(candidate));
}

function missingLibraryMessage() {
  return [
    '[Aura Player] Cannot build the Debian package: electron-builder bundled FPM requires the build-time library libcrypt.so.1.',
    '',
    'On Fedora 45 (including Fedora 44), install the compatibility package:',
    '  sudo dnf install libxcrypt-compat',
    '',
    'Verify that the linker can see it:',
    "  ldconfig -p | grep 'libcrypt.so.1'",
    '',
    'Then retry:',
    '  npm run desktop:dist:linux',
    '',
    'This is a dependency of the packaging tool on the build machine only. It is NOT an Aura Player runtime dependency and is NOT required by end users.',
    'The AppImage target does not need this library and can be built independently with:',
    '  npm run desktop:dist:appimage',
  ].join('\n');
}

function resolveElectronBuilder() {
  const command = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
  const local = path.join(ROOT, 'node_modules', '.bin', command);
  if (fs.existsSync(local)) return local;
  return null;
}

function ensureNativeRuntime() {
  const dist = path.join(ROOT, 'native', 'dist');
  const executable = path.join(dist, process.platform === 'win32' ? 'aura-mpv-frame-host.exe' : 'aura-mpv-frame-host');
  const required = [
    [executable, 'The embedded libmpv render host'],
    [path.join(dist, 'runtime-manifest.json'), 'The offline runtime checksum manifest'],
    [path.join(dist, 'codec-inventory.json'), 'The actual FFmpeg/libmpv decoder inventory'],
  ];
  const missing = required.filter(([file]) => !fs.existsSync(file));
  if (missing.length) {
    throw new Error([
      'The embedded offline playback runtime has not been built completely.',
      ...missing.map(([, label]) => `Missing: ${label}`),
      'Run these commands in order:',
      '  npm run native:build',
      '  npm run codec:diagnose',
      '  npm run desktop:dist:linux',
      'Do not run this packaging script directly before the native build succeeds.',
    ].join('\n'));
  }
}

function runElectronBuilder(args) {
  const command = resolveElectronBuilder();
  if (!command) {
    console.error('[Aura Player] Local electron-builder was not found. Run `npm install` in the project directory first.');
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  if (result.error) {
    console.error(`[Aura Player] Could not start local electron-builder (${command}): ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  if (result.signal) {
    console.error(`[Aura Player] electron-builder terminated by signal ${result.signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status ?? 1;
}

function main() {
  if (process.platform !== 'linux') {
    console.error('[Aura Player] The Linux package script must be run on a Linux build host.');
    process.exitCode = 1;
    return;
  }

  if (!hasLegacyLibcrypt()) {
    console.error(missingLibraryMessage());
    process.exitCode = 1;
    return;
  }

  try { ensureNativeRuntime(); }
  catch (error) { console.error(`[Aura Player] ${error.message}`); process.exitCode = 1; return; }

  console.log('[Aura Player] Build prerequisites found: libcrypt.so.1 and embedded offline libmpv runtime. Building AppImage and DEB...');
  runElectronBuilder(['--linux', 'AppImage', 'deb']);
}

if (require.main === module) main();

module.exports = {
  LEGACY_LIBCRYPT_PATHS,
  hasLegacyLibcrypt,
  missingLibraryMessage,
  resolveElectronBuilder,
  ensureNativeRuntime,
};
