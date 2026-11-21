const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureNativeRuntime } = require('../scripts/build-linux-packages.cjs');

const root = path.resolve(__dirname, '..');
const nativeSource = fs.readFileSync(path.join(root, 'native/mpv-frame-host/main.cpp'), 'utf8');
const packageScript = fs.readFileSync(path.join(root, 'scripts/build-linux-packages.cjs'), 'utf8');
const nativeBuildScript = fs.readFileSync(path.join(root, 'scripts/build-native-engine.cjs'), 'utf8');


test('libmpv OpenGL init is compatible with current two-field headers and older headers', () => {
  assert.match(nativeSource, /mpv_opengl_init_params\s+glInit\s*\{\s*\}/);
  assert.match(nativeSource, /glInit\.get_proc_address\s*=\s*getGlProcAddress/);
  assert.match(nativeSource, /glInit\.get_proc_address_ctx\s*=\s*nullptr/);
  assert.doesNotMatch(nativeSource, /mpv_opengl_init_params\s+glInit\s*\{[^}]*,[^}]*,[^}]*\}/);
});

test('64-bit video dimensions use a matching printf format and argument type', () => {
  assert.match(nativeSource, /width=%lld height=%lld/);
  assert.match(nativeSource, /static_cast<long long>\(width\)/);
  assert.match(nativeSource, /static_cast<long long>\(height\)/);
});

test('Linux packager resolves electron-builder from the local project installation', () => {
  assert.match(packageScript, /node_modules['"]?,\s*['"]\.bin['"]?/);
  assert.match(packageScript, /resolveElectronBuilder/);
  assert.match(packageScript, /Local electron-builder was not found/);
});

test('Linux package script rejects packaging before the native codec runtime is built', () => {
  assert.match(packageScript, /function ensureNativeRuntime\(\)/);
  assert.match(packageScript, /runtime-manifest\.json/);
  assert.match(packageScript, /codec-inventory\.json/);
  assert.throws(() => ensureNativeRuntime(), /embedded offline playback runtime has not been built completely/);
});


test('codec inventory accepts FFmpeg decoder aliases from codec and driver fields', () => {
  assert.match(nativeSource, /if\s*\(!codec\.empty\(\)\)\s*discovered\.push_back\(codec\)/);
  assert.match(nativeSource, /if\s*\(!driver\.empty\(\)\)\s*discovered\.push_back\(driver\)/);
  assert.match(nativeSource, /"dca"/);
  assert.doesNotMatch(nativeSource, /"wma"\s*,\s*"wmav1"/);
  assert.match(nativeSource, /"wmav1"\s*,\s*"wmav2"/);
});


test('libmpv uses build-compatible automatic hwdec interop instead of forcing debug-only backend names', () => {
  assert.match(nativeSource, /setOption\("hwdec", "auto-safe"\)/);
  assert.match(nativeSource, /emitEvent\("hwdec-interop-policy", "libmpv-default-auto"\)/);
  assert.doesNotMatch(nativeSource, /setOption\("gpu-hwdec-interop"/);
  assert.doesNotMatch(nativeSource, /preferredLinuxHwdecInterop/);
  assert.doesNotMatch(nativeSource, /return \"vaapi-egl\"|return \"vaapi-glx\"/);
});

test('Windows PE dependency audit allows large objdump metadata output', () => {
  assert.match(nativeBuildScript, /spawnSync\('objdump',\s*\['-p', executable\],\s*\{[\s\S]*?maxBuffer:\s*32\s*\*\s*1024\s*\*\s*1024/);
});
