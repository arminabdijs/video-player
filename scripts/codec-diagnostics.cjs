'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const VIDEO_DECODERS = new Set([
  'h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg1video', 'mpeg2video', 'mpeg4',
  'vc1', 'wmv1', 'wmv2', 'wmv3', 'prores', 'dnxhd', 'ffv1', 'huffyuv', 'theora',
]);
const AUDIO_DECODERS = new Set([
  'aac', 'mp3', 'mp3float', 'ac3', 'eac3', 'dca', 'truehd', 'mlp', 'flac', 'opus',
  'vorbis', 'alac', 'ape', 'wavpack', 'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice', 'pcm_s16le', 'pcm_s24le',
]);

function parseDecoderNames(output, known) {
  const found = new Set();
  for (const line of String(output || '').split(/\r?\n/)) {
    for (const name of known) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|[\\s:]|\\[)${escaped}(?=$|[\\s(\\]:])`, 'i').test(line)) found.add(name);
    }
  }
  return found;
}

function parseVideoDecoders(output) { return parseDecoderNames(output, VIDEO_DECODERS); }
function parseAudioDecoders(output) { return parseDecoderNames(output, AUDIO_DECODERS); }

function resolveNativeEngine() {
  const executable = process.platform === 'win32' ? 'aura-mpv-frame-host.exe' : 'aura-mpv-frame-host';
  const root = path.resolve(__dirname, '..');
  const candidates = [
    path.join(root, 'native', 'dist', executable),
    path.join(process.resourcesPath || '', 'native', executable),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function main() {
  const executable = resolveNativeEngine();
  if (!executable) {
    console.error('[Aura Player] Embedded libmpv runtime is not built. Run `npm run native:build` first.');
    process.exitCode = 1;
    return;
  }

  const runtimeDirectory = path.dirname(executable);
  const env = { ...process.env };
  if (process.platform === 'win32') env.PATH = `${runtimeDirectory}${path.delimiter}${env.PATH || ''}`;
  else env.LD_LIBRARY_PATH = `${path.join(runtimeDirectory, 'lib')}${path.delimiter}${env.LD_LIBRARY_PATH || ''}`;

  const result = spawnSync(executable, ['--diagnose-codecs'], {
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env,
  });
  if (result.error || result.status !== 0) {
    console.error(`[Aura Player] libmpv codec inspection failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
    process.exitCode = 1;
    return;
  }

  let report;
  try { report = JSON.parse(result.stdout); }
  catch { console.error('[Aura Player] libmpv returned malformed decoder metadata.'); process.exitCode = 1; return; }
  const decoders = Array.isArray(report.decoders) ? report.decoders : [];
  if (!decoders.length) {
    console.error('[Aura Player] The bundled libmpv build did not report any decoders.');
    process.exitCode = 1;
    return;
  }

  console.log(`Embedded libmpv decoder inventory (${decoders.length} entries):`);
  if (Array.isArray(report.missingRequired) && report.missingRequired.length) {
    console.error(`Missing required decoders: ${report.missingRequired.join(', ')}`);
    process.exitCode = 2;
  } else {
    console.log('Required codec baseline: complete.');
  }
  for (const item of decoders) {
    const name = [item.codec, item.driver].filter(Boolean).join(' / ') || 'unknown';
    console.log(`  ${name}${item.description ? ` — ${item.description}` : ''}`);
  }
}

if (require.main === module) main();
module.exports = { resolveNativeEngine, parseVideoDecoders, parseAudioDecoders };
