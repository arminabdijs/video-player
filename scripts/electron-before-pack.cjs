'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = async function beforePack(context) {
  const platform = context.electronPlatformName || process.platform;
  const arch = context.arch === 1 ? 'x64' : String(context.arch);
  if (arch !== 'x64') throw new Error(`Aura Player native libmpv runtime is currently locked to x64, not ${arch}.`);
  if (platform !== 'linux' && platform !== 'win32') {
    throw new Error(`Aura Player native libmpv playback is not configured for ${platform}.`);
  }

  const dist = path.resolve(__dirname, '..', 'native', 'dist');
  const executable = path.join(dist, platform === 'win32' ? 'aura-mpv-frame-host.exe' : 'aura-mpv-frame-host');
  if (!fs.existsSync(executable)) {
    throw new Error([
      'The embedded libmpv render engine has not been built for this target.',
      `Expected: ${executable}`,
      'Build it on the target operating system before packaging:',
      '  npm run native:build',
      'The installer is intentionally blocked instead of shipping a player that falls back to an external MPV window.',
    ].join('\n'));
  }
  if (platform === 'linux' && !fs.existsSync(path.join(dist, 'RUNTIME-LIBRARIES.txt'))) {
    throw new Error('The bundled Linux libmpv runtime dependency manifest is missing. Run npm run native:build again.');
  }
  const runtimeManifestPath = path.join(dist, 'runtime-manifest.json');
  if (!fs.existsSync(runtimeManifestPath)) {
    throw new Error('The offline runtime SHA-256 manifest is missing. Rebuild the native engine before packaging.');
  }
  let runtimeManifest;
  try { runtimeManifest = JSON.parse(fs.readFileSync(runtimeManifestPath, 'utf8')); }
  catch { throw new Error('The offline runtime SHA-256 manifest is invalid JSON. Rebuild the native engine.'); }
  if (runtimeManifest.platform !== platform || runtimeManifest.arch !== 'x64' || !Array.isArray(runtimeManifest.files) || !runtimeManifest.files.length) {
    throw new Error(`The offline runtime manifest does not match ${platform}/x64 or contains no files.`);
  }
  for (const entry of runtimeManifest.files) {
    if (!entry || typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '') || !Number.isInteger(entry.size)) {
      throw new Error('The offline runtime manifest contains a malformed file entry. Rebuild the native engine.');
    }
    const filePath = path.resolve(dist, entry.file);
    if (!filePath.startsWith(`${dist}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`Bundled runtime file is missing or invalid: ${entry.file}`);
    }
    const bytes = fs.readFileSync(filePath);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entry.size || digest !== entry.sha256) {
      throw new Error(`Bundled runtime integrity check failed: ${entry.file}`);
    }
  }
  const codecInventory = path.join(dist, 'codec-inventory.json');
  if (!fs.existsSync(codecInventory)) {
    throw new Error('The bundled native decoder inventory is missing. Rebuild the native engine and verify codecs before packaging.');
  }
  let codecReport;
  try { codecReport = JSON.parse(fs.readFileSync(codecInventory, 'utf8')); }
  catch { throw new Error('The bundled native decoder inventory is invalid JSON. Rebuild the native engine.'); }
  if (!Array.isArray(codecReport.decoders) || !Array.isArray(codecReport.missingRequired) || codecReport.missingRequired.length) {
    throw new Error(`The bundled runtime is missing required codecs: ${(codecReport.missingRequired || []).join(', ') || 'decoder inventory invalid'}. Packaging is blocked.`);
  }
  if (platform === 'win32' && (!fs.existsSync(path.join(dist, 'libmpv-2.dll')) || !fs.existsSync(path.join(dist, 'SDL2.dll')))) {
    throw new Error('Bundled Windows libmpv-2.dll or SDL2.dll is missing. Run npm run native:build with a complete MPV_RUNTIME_DIR.');
  }
  console.log(`[Aura Player] Packaging self-contained embedded libmpv runtime (${platform}/${arch}).`);
};
