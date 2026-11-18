'use strict';

const { hasLegacyLibcrypt, missingLibraryMessage } = require('./build-linux-packages.cjs');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'linux') {
  console.error('[Aura Player] The DEB package must be built on a Linux build host.');
  process.exitCode = 1;
} else if (!hasLegacyLibcrypt()) {
  console.error(missingLibraryMessage());
  process.exitCode = 1;
} else {
  const result = spawnSync('electron-builder', ['--linux', 'deb'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`[Aura Player] Could not start electron-builder: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
