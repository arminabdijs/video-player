const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LEGACY_LIBCRYPT_PATHS,
  hasLegacyLibcrypt,
  missingLibraryMessage,
} = require('../scripts/build-linux-packages.cjs');

test('Linux package preflight accepts libcrypt.so.1 reported by ldconfig', () => {
  assert.equal(hasLegacyLibcrypt({
    ldconfigOutput: 'libcrypt.so.1 (libc6,x86-64) => /lib64/libcrypt.so.1',
    existsSync: () => false,
  }), true);
});

test('Linux package preflight checks common Fedora and Debian library paths', () => {
  const expectedPath = '/usr/lib64/libcrypt.so.1';
  assert.ok(LEGACY_LIBCRYPT_PATHS.includes(expectedPath));
  assert.equal(hasLegacyLibcrypt({
    ldconfigOutput: '',
    existsSync: (candidate) => candidate === expectedPath,
  }), true);
});

test('Linux package preflight rejects a missing compatibility library', () => {
  assert.equal(hasLegacyLibcrypt({
    ldconfigOutput: '',
    existsSync: () => false,
  }), false);
});

test('Missing-library instructions distinguish build tools from end-user runtime', () => {
  const message = missingLibraryMessage();
  assert.match(message, /sudo dnf install libxcrypt-compat/);
  assert.match(message, /NOT an Aura Player runtime dependency/);
  assert.match(message, /desktop:dist:appimage/);
});
