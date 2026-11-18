'use strict';

const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'info.arminabdi.aura-player';
const ICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512];

function assertTransparentPng(filePath) {
  const bytes = fs.readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 26 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`Aura Player icon is not a valid PNG: ${filePath}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  if (width !== height || width < 256 || colorType !== 6) {
    throw new Error(`Aura Player Linux icon must be a square RGBA PNG of at least 256px: ${filePath}`);
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  if (typeof context.appOutDir !== 'string' || !context.appOutDir) {
    throw new Error('Aura Player afterPack did not receive a Linux appOutDir.');
  }

  const projectRoot = path.resolve(__dirname, '..');
  const source = path.join(projectRoot, 'assets', 'icons', 'aura-player.png');
  const linuxIcons = path.join(projectRoot, 'assets', 'icons', 'linux');
  assertTransparentPng(source);
  fs.copyFileSync(source, path.join(context.appOutDir, '.DirIcon'));
  fs.copyFileSync(source, path.join(context.appOutDir, 'aura-player.png'));

  const iconRoot = path.join(context.appOutDir, 'usr', 'share', 'icons', 'hicolor');
  for (const size of ICON_SIZES) {
    const iconSource = path.join(linuxIcons, `${size}x${size}.png`);
    if (!fs.existsSync(iconSource)) throw new Error(`Missing Linux icon size: ${iconSource}`);
    const iconTarget = path.join(iconRoot, `${size}x${size}`, 'apps', `${APP_ID}.png`);
    fs.mkdirSync(path.dirname(iconTarget), { recursive: true });
    fs.copyFileSync(iconSource, iconTarget);
  }

  // electron-builder's afterPack hook receives the unpacked application staging
  // directory, not the final AppImage AppDir or a system applications directory.
  // The .desktop entry is generated later by the Linux target from package.json:
  // root desktopName + build.linux.syncDesktopName + build.linux.desktop.entry.
  // Do not search for usr/share/applications here: that path does not exist at
  // this lifecycle stage and caused valid AppImage builds to fail after native build.

  console.log(`[Aura Player] Embedded transparent AppImage icons; desktop identity comes from ${APP_ID}.desktop build metadata.`);
  console.log('[Aura Player] Embedded transparent Hicolor icon sizes, .DirIcon and root icon for AppImage metadata readers.');
};

module.exports.assertTransparentPng = assertTransparentPng;
