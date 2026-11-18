'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_ROOT = path.join(ROOT, 'native');
const SOURCE_DIR = path.join(NATIVE_ROOT, 'mpv-frame-host');
const BUILD_DIR = path.join(NATIVE_ROOT, 'build');
const DIST_DIR = path.join(NATIVE_ROOT, 'dist');
const SYSTEM_LINUX_LIBS = [
  /^libc\.so/, /^libm\.so/, /^libdl\.so/, /^libpthread\.so/, /^librt\.so/,
  /^ld-linux/, /^libGL\.so/, /^libEGL\.so/, /^libGLX\.so/, /^libOpenGL\.so/,
  /^libX11/, /^libXext/, /^libxcb/, /^libwayland/, /^libxkbcommon/,
  /^libdrm/, /^libgbm/, /^libudev/, /^libasound/, /^libpulse/, /^libpipewire/,
  /^libjack/, /^libvulkan/,
];

const REQUIRED_CODECS = [
  'h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg1video', 'mpeg2video', 'mpeg4',
  'vc1', 'wmv1', 'wmv2', 'wmv3', 'mjpeg', 'prores', 'dnxhd', 'ffv1', 'huffyuv', 'theora', 'dvvideo',
  'aac', 'mp3', 'ac3', 'eac3', 'dca', 'truehd', 'mlp', 'flac', 'opus', 'vorbis', 'alac',
  'ape', 'wavpack', 'wmav1', 'wmav2', 'pcm_s16le', 'pcm_s24le',
];

function verifyBundledCodecs(executable, platform) {
  const env = { ...process.env };
  if (platform === 'win32') env.PATH = `${DIST_DIR}${path.delimiter}${env.PATH || ''}`;
  else env.LD_LIBRARY_PATH = `${path.join(DIST_DIR, 'lib')}${path.delimiter}${env.LD_LIBRARY_PATH || ''}`;
  const result = spawnSync(executable, ['--verify-required-codecs'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) fail(`Could not inspect bundled libmpv codecs: ${result.error.message}`);
  let report;
  try { report = JSON.parse(result.stdout || '{}'); }
  catch { fail(`Bundled libmpv returned invalid codec metadata.\n${result.stderr || result.stdout || ''}`); }
  const missing = Array.isArray(report.missingRequired) ? report.missingRequired : REQUIRED_CODECS;
  fs.writeFileSync(path.join(DIST_DIR, 'codec-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (result.status !== 0 || missing.length) {
    fail([
      'The selected libmpv/FFmpeg build is missing required audio/video decoders.',
      `Missing: ${missing.join(', ') || 'unknown'}`,
      'Do not package this runtime as a complete codec build.',
      'Use a libmpv build compiled with the required FFmpeg decoders, then run npm run native:build again.',
      'The actual bundled decoder inventory is saved at native/dist/codec-inventory.json.',
    ].join('\n'));
  }
  console.log(`[Aura Player] Verified ${Array.isArray(report.decoders) ? report.decoders.length : 0} native decoders; required codecs present.`);
}

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
    windowsHide: true,
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}.${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function requireLinuxBuildDependencies() {
  const probe = spawnSync('pkg-config', ['--exists', 'mpv', 'sdl2', 'gl'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    fail([
      'libmpv, SDL2 and OpenGL development files are required to build Aura Player native playback.',
      'On Fedora 45, install the build dependencies with:',
      '  sudo dnf install cmake gcc-c++ pkgconf-pkg-config mpv-devel sdl2-compat-devel mesa-libGL-devel',
      'Then run:',
      '  npm run native:build',
      '',
      'These are build-machine dependencies. The build script copies the media/codec libraries into the application resources.',
    ].join('\n'));
  }
}

function copyLinuxRuntimeDependencies(executable) {
  const result = spawnSync('ldd', [executable], { encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(`Could not inspect native engine dependencies with ldd: ${result.error?.message || result.stderr}`);
  const destination = path.join(DIST_DIR, 'lib');
  fs.mkdirSync(destination, { recursive: true });
  const copied = new Set();
  const missing = [];

  for (const line of result.stdout.split(/\r?\n/)) {
    const unavailable = line.match(/^\s*(\S+)\s+=>\s+not found/);
    if (unavailable && !SYSTEM_LINUX_LIBS.some((pattern) => pattern.test(unavailable[1]))) {
      missing.push(`${unavailable[1]} => not found`);
      continue;
    }
    const match = line.match(/^\s*(\S+)\s+=>\s+(\/\S+)\s+\(/);
    if (!match) {
      const direct = line.match(/^\s*(\/\S+)\s+\(/);
      if (direct) {
        const soname = path.basename(direct[1]);
        if (SYSTEM_LINUX_LIBS.some((pattern) => pattern.test(soname))) continue;
        missing.push(`${soname} (direct dependency format not recognized)`);
      }
      continue;
    }
    const [, soname, resolvedPath] = match;
    if (SYSTEM_LINUX_LIBS.some((pattern) => pattern.test(soname))) continue;
    if (copied.has(soname)) continue;
    if (!fs.existsSync(resolvedPath)) {
      missing.push(`${soname} => ${resolvedPath}`);
      continue;
    }
    fs.copyFileSync(resolvedPath, path.join(destination, soname));
    copied.add(soname);
  }

  if (missing.length) fail(`Some native engine dependencies could not be bundled:\n${missing.join('\n')}`);
  if (![...copied].some((name) => /^libmpv\.so/.test(name))) {
    fail('The native engine does not resolve libmpv. Install mpv-devel and rebuild.');
  }
  const names = [...copied].sort();
  fs.writeFileSync(path.join(DIST_DIR, 'RUNTIME-LIBRARIES.txt'),
    `Bundled Linux runtime libraries (${copied.size}):\n${names.join('\n')}\n\n` +
    'Host display-server, OpenGL/EGL, GPU driver, audio-server, and glibc libraries are intentionally provided by the Linux operating system.\n');
  const manifest = names.map((name) => {
    const fullPath = path.join(destination, name);
    const bytes = fs.readFileSync(fullPath);
    return { file: `lib/${name}`, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  const helperBytes = fs.readFileSync(executable);
  manifest.push({ file: path.basename(executable), size: helperBytes.length, sha256: crypto.createHash('sha256').update(helperBytes).digest('hex') });
  fs.writeFileSync(path.join(DIST_DIR, 'runtime-manifest.json'), `${JSON.stringify({ platform: 'linux', arch: 'x64', files: manifest }, null, 2)}\n`);
}

function buildLinux() {
  requireLinuxBuildDependencies();
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  run('cmake', ['-S', SOURCE_DIR, '-B', BUILD_DIR, '-DCMAKE_BUILD_TYPE=Release']);
  run('cmake', ['--build', BUILD_DIR, '--config', 'Release', '--parallel', String(Math.max(1, os.cpus().length - 1))]);
  const built = path.join(BUILD_DIR, 'dist', 'aura-mpv-frame-host');
  if (!fs.existsSync(built)) fail(`CMake completed but the native host was not created: ${built}`);
  fs.copyFileSync(built, path.join(DIST_DIR, 'aura-mpv-frame-host'));
  fs.chmodSync(path.join(DIST_DIR, 'aura-mpv-frame-host'), 0o755);
  copyLinuxRuntimeDependencies(path.join(DIST_DIR, 'aura-mpv-frame-host'));
  verifyBundledCodecs(path.join(DIST_DIR, 'aura-mpv-frame-host'), 'linux');
}

function buildWindows() {
  const includeDir = process.env.MPV_INCLUDE_DIR;
  const importLibrary = process.env.MPV_LIB;
  const runtimeDir = process.env.MPV_RUNTIME_DIR;
  if (!includeDir || !importLibrary || !runtimeDir) {
    fail([
      'Windows native playback requires the libmpv SDK and runtime DLL bundle.',
      'Set MPV_INCLUDE_DIR, MPV_LIB and MPV_RUNTIME_DIR to the matching x64 libmpv SDK/runtime.',
      'MPV_RUNTIME_DIR must contain libmpv-2.dll, SDL2.dll and the FFmpeg/codec dependency DLLs.',
      'Build on Windows x64 with Visual Studio Build Tools, CMake and the SDL2 development package.',
      'The Windows runtime is not downloaded at app launch; it is copied into resources during packaging.',
    ].join('\n'));
  }
  if (!fs.existsSync(path.join(includeDir, 'mpv', 'client.h')) && !fs.existsSync(path.join(includeDir, 'client.h'))) {
    fail(`MPV_INCLUDE_DIR does not contain mpv/client.h: ${includeDir}`);
  }
  if (!fs.existsSync(importLibrary)) fail(`MPV_LIB was not found: ${importLibrary}`);
  if (!fs.existsSync(path.join(runtimeDir, 'libmpv-2.dll'))) fail('MPV_RUNTIME_DIR must contain libmpv-2.dll.');
  if (!fs.existsSync(path.join(runtimeDir, 'SDL2.dll'))) fail('MPV_RUNTIME_DIR must contain SDL2.dll.');

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  run('cmake', ['-S', SOURCE_DIR, '-B', BUILD_DIR, '-A', 'x64', '-DCMAKE_BUILD_TYPE=Release'], { stdio: 'inherit' });
  run('cmake', ['--build', BUILD_DIR, '--config', 'Release', '--parallel']);
  const built = path.join(BUILD_DIR, 'dist', 'Release', 'aura-mpv-frame-host.exe');
  const alternate = path.join(BUILD_DIR, 'dist', 'aura-mpv-frame-host.exe');
  const executable = fs.existsSync(built) ? built : alternate;
  if (!fs.existsSync(executable)) fail('CMake did not produce aura-mpv-frame-host.exe.');
  fs.copyFileSync(executable, path.join(DIST_DIR, 'aura-mpv-frame-host.exe'));
  for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
      fs.copyFileSync(path.join(runtimeDir, entry.name), path.join(DIST_DIR, entry.name));
    }
  }
  const runtimeFiles = ['aura-mpv-frame-host.exe', ...fs.readdirSync(DIST_DIR).filter((name) => name.toLowerCase().endsWith('.dll'))].sort();
  fs.writeFileSync(path.join(DIST_DIR, 'RUNTIME-LIBRARIES.txt'),
    `Bundled Windows libmpv, SDL2, FFmpeg and codec runtime DLLs (${runtimeFiles.length} files).\n`);
  const manifest = runtimeFiles.map((name) => {
    const bytes = fs.readFileSync(path.join(DIST_DIR, name));
    return { file: name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  fs.writeFileSync(path.join(DIST_DIR, 'runtime-manifest.json'), `${JSON.stringify({ platform: 'win32', arch: 'x64', files: manifest }, null, 2)}\n`);
  verifyBundledCodecs(path.join(DIST_DIR, 'aura-mpv-frame-host.exe'), 'win32');
}

function main() {
  if (!fs.existsSync(path.join(SOURCE_DIR, 'CMakeLists.txt'))) fail(`Native engine source is missing: ${SOURCE_DIR}`);
  if (process.platform === 'linux') buildLinux();
  else if (process.platform === 'win32') buildWindows();
  else fail(`Unsupported native build platform: ${process.platform}. Build Linux on Linux and Windows on Windows.`);
  console.log(`[Aura Player] Native libmpv render host and bundled runtime prepared: ${DIST_DIR}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(`[Aura Player] Native engine build failed:\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { SYSTEM_LINUX_LIBS, REQUIRED_CODECS, requireLinuxBuildDependencies, copyLinuxRuntimeDependencies, verifyBundledCodecs };
