'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const APP_ID = 'info.arminabdi.aura-player';
const APP_NAME = 'Aura Player';
const SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512];
const MIME_TYPES = [
  'video/mp4', 'video/x-matroska', 'video/webm', 'video/x-msvideo',
  'video/quicktime', 'video/mpeg', 'video/mp2t', 'video/x-ms-wmv',
  'video/x-flv', 'video/x-ms-asf', 'video/ogg', 'application/ogg',
  'application/vnd.apple.mpegurl', 'application/x-mpegURL',
  'application/dash+xml', 'application/mxf', 'video/x-matroska-3d',
  'video/x-ivf', 'video/x-nut', 'video/x-yuv4mpeg', 'video/x-rm',
];

function desktopQuote(value) {
  return `"${String(value).replace(/([\\"`$])/g, '\\$1')}"`;
}

function runOptional(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  return !result.error && result.status === 0;
}

function integrate(appImagePath, env = process.env) {
  if (process.platform !== 'linux') throw new Error('Linux desktop integration can only run on Linux.');
  if (!appImagePath) throw new Error('Usage: npm run desktop:integrate:linux -- /absolute/path/AuraPlayer.AppImage');
  const resolved = path.resolve(appImagePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`AppImage not found: ${resolved}`);
  fs.accessSync(resolved, fs.constants.X_OK);

  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const appDir = path.join(dataHome, 'applications');
  const iconRoot = path.join(dataHome, 'icons', 'hicolor');
  const sourceRoot = path.resolve(__dirname, '..', 'assets', 'icons', 'linux');
  const icon = path.join(__dirname, '..', 'assets', 'icons', 'aura-player.png');
  if (!fs.existsSync(icon)) throw new Error(`Master application icon is missing: ${icon}`);

  fs.mkdirSync(appDir, { recursive: true });
  for (const size of SIZES) {
    const source = path.join(sourceRoot, `${size}x${size}.png`);
    if (!fs.existsSync(source)) throw new Error(`Required Linux icon size is missing: ${source}`);
    const destination = path.join(iconRoot, `${size}x${size}`, 'apps', `${APP_ID}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  const desktopFile = path.join(appDir, `${APP_ID}.desktop`);
  const exec = `${desktopQuote(resolved)} %U`;
  const content = [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    `Name=${APP_NAME}`,
    'GenericName=Media Player',
    'Comment=Play local video and audio files',
    `Exec=${exec}`,
    `TryExec=${desktopQuote(resolved)}`,
    `Icon=${APP_ID}`,
    'Terminal=false',
    'Categories=AudioVideo;Video;Player;',
    'StartupNotify=true',
    `StartupWMClass=${APP_ID}`,
    `MimeType=${MIME_TYPES.join(';')};`,
    '',
  ].join('\n');
  fs.writeFileSync(desktopFile, content, { mode: 0o644 });

  runOptional('update-desktop-database', [appDir]);
  runOptional('gtk-update-icon-cache', ['-f', '-t', iconRoot]);

  return { desktopFile, iconRoot, appImage: resolved, appId: APP_ID };
}

if (require.main === module) {
  try {
    const result = integrate(process.argv[2]);
    console.log(`[Aura Player] Desktop integration installed: ${result.desktopFile}`);
    console.log(`[Aura Player] Stable desktop identity: ${result.appId}`);
    console.log('[Aura Player] If an old launcher is pinned, unpin that old Aura Player item and pin the new Applications-menu entry once.');
  } catch (error) {
    console.error(`[Aura Player] Linux integration failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { APP_ID, SIZES, desktopQuote, integrate };
