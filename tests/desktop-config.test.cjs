const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const mainSource = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
const hostSource = fs.readFileSync(path.join(root, 'desktop/embedded-mpv-host.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'desktop/preload.cjs'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'scripts/script.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nativeSource = fs.readFileSync(path.join(root, 'native/mpv-frame-host/main.cpp'), 'utf8');
const cmakeSource = fs.readFileSync(path.join(root, 'native/mpv-frame-host/CMakeLists.txt'), 'utf8');
const beforePackSource = fs.readFileSync(path.join(root, 'scripts/electron-before-pack.cjs'), 'utf8');
const trustedRendererSource = fs.readFileSync(path.join(root, 'desktop/trusted-renderer.cjs'), 'utf8');
const nativeStatusSource = fs.readFileSync(path.join(root, 'desktop/native-status.cjs'), 'utf8');
const pipPreloadSource = fs.readFileSync(path.join(root, 'desktop/pip-preload.cjs'), 'utf8');
const pipHtmlSource = fs.readFileSync(path.join(root, 'desktop/pip.html'), 'utf8');
const pipPlayerSource = fs.readFileSync(path.join(root, 'desktop/pip.js'), 'utf8');

test('desktop build is pinned to the embedded-renderer release', () => {
  assert.equal(packageJson.version, '2.5.13');
  assert.equal(packageJson.main, 'desktop/main.cjs');
  assert.ok(packageJson.scripts['native:build']);
  assert.match(packageJson.scripts['desktop:dev'], /native:build/);
  assert.match(packageJson.scripts['desktop:dist:linux'], /native:build/);
  assert.match(packageJson.scripts['desktop:dist:windows'], /Build-Windows-Setup\.ps1/);
  assert.match(packageJson.scripts['desktop:dist:current'], /build-current-installer\.cjs/);
  assert.equal(packageJson.build.beforePack, 'scripts/electron-before-pack.cjs');
});

test('Aura Player uses transparent multi-resolution icons across Linux, Windows, the app window and favicon', () => {
  assert.equal(packageJson.build.win.icon, 'assets/icons/aura-player.ico');
  assert.equal(packageJson.build.linux.icon, 'assets/icons/linux');
  assert.equal(packageJson.desktopName, 'info.arminabdi.aura-player');
  assert.equal(packageJson.build.linux.syncDesktopName, true);
  assert.equal(packageJson.build.linux.desktop.entry.StartupWMClass, 'info.arminabdi.aura-player');
  assert.equal(packageJson.build.linux.desktop.entry.Icon, 'info.arminabdi.aura-player');
  assert.ok(fs.existsSync(path.join(root, packageJson.build.win.icon)));
  assert.ok(fs.existsSync(path.join(root, packageJson.build.linux.icon, '512x512.png')));
  assert.equal(packageJson.build.afterPack, 'scripts/electron-after-pack.cjs');
  const pngPaths = [
    'assets/icons/aura-player-master.png',
    'assets/icons/aura-player.png',
    ...[16, 24, 32, 48, 64, 96, 128, 256, 512].map((size) => `assets/icons/linux/${size}x${size}.png`),
  ];
  for (const iconPath of pngPaths) {
    const bytes = fs.readFileSync(path.join(root, iconPath));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${iconPath} must be PNG`);
    assert.equal(bytes[25], 6, `${iconPath} must use RGBA transparency`);
    assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20), `${iconPath} must be square`);
    const expectedSize = iconPath.endsWith('master.png') ? 1024
      : iconPath.endsWith('/aura-player.png') ? 512
        : Number(path.basename(iconPath).split('x')[0]);
    assert.equal(bytes.readUInt32BE(16), expectedSize, `${iconPath} must have its declared size`);
  }
  const iconBuffer = fs.readFileSync(path.join(root, packageJson.build.win.icon));
  assert.equal(iconBuffer.readUInt16LE(0), 0, 'ICO reserved field');
  assert.equal(iconBuffer.readUInt16LE(2), 1, 'ICO image type');
  assert.ok(iconBuffer.readUInt16LE(4) >= 7, 'ICO must contain multiple resolutions');
  const afterPackSource = fs.readFileSync(path.join(root, packageJson.build.afterPack), 'utf8');
  assert.match(afterPackSource, /\.DirIcon/);
  assert.match(afterPackSource, /aura-player\.png/);
  assert.match(afterPackSource, /desktop identity comes from/);
  assert.match(afterPackSource, /Do not search for usr\/share\/applications here/);
  assert.match(afterPackSource, /info\.arminabdi\.aura-player/);
  assert.match(afterPackSource, /colorType !== 6/);
  assert.match(mainSource, /icon: path\.join\(APP_ROOT, 'assets', 'icons', 'aura-player\.png'\)/);
  assert.match(mainSource, /app\.setAppUserModelId\('info\.arminabdi\.aura-player'\)/);
  assert.match(htmlSource, /assets\/icons\/aura-player\.png/);
});

test('Linux afterPack embeds transparent AppImage icon metadata for Gear Lever', async () => {
  const os = require('node:os');
  const afterPack = require('../scripts/electron-after-pack.cjs');
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-player-appdir-'));
  try {
    // The afterPack hook receives linux-unpacked, before electron-builder
    // generates the final AppImage desktop entry. No usr/share/applications
    // tree should be required at this lifecycle stage.
    await afterPack({ electronPlatformName: 'linux', appOutDir });
    const source = fs.readFileSync(path.join(root, 'assets/icons/aura-player.png'));
    for (const fileName of ['.DirIcon', 'aura-player.png']) {
      const embedded = fs.readFileSync(path.join(appOutDir, fileName));
      assert.deepEqual(embedded, source, `${fileName} must match the transparent application icon`);
      assert.equal(embedded[25], 6, `${fileName} must preserve RGBA alpha`);
    }
    for (const size of [16, 24, 32, 48, 64, 96, 128, 256, 512]) {
      assert.ok(fs.existsSync(path.join(appOutDir, 'usr/share/icons/hicolor', `${size}x${size}`, 'apps', 'info.arminabdi.aura-player.png')));
    }
    const untouchedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-player-nonlinux-'));
    try {
      await afterPack({ electronPlatformName: 'win32', appOutDir: untouchedDir });
      assert.deepEqual(fs.readdirSync(untouchedDir), []);
    } finally {
      fs.rmSync(untouchedDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
});

test('desktop packages embed native resources, not an external MPV CLI', () => {
  assert.ok(packageJson.build.extraResources.some((entry) => entry.from === 'native/dist' && entry.to === 'native'));
  assert.doesNotMatch(JSON.stringify(packageJson.build.extraResources), /vendor\/mpv/);
  assert.deepEqual(packageJson.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.ok(packageJson.build.linux.target.some((entry) => entry.target === 'AppImage'));
  assert.ok(packageJson.build.linux.target.some((entry) => entry.target === 'deb'));
});

test('Electron uses an isolated renderer and trusted embedded-engine IPC', () => {
  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /sandbox:\s*true/);
  assert.match(mainSource, /EmbeddedMpvHost/);
  assert.match(mainSource, /isTrustedRendererEvent/);
  assert.doesNotMatch(mainSource, /senderFrame\s*!==\s*mainWindow\.webContents\.mainFrame/);
  assert.match(trustedRendererSource, /fileURLToPath/);
  assert.match(trustedRendererSource, /frame\.parent !== null/);
  assert.match(hostSource, /spawn\(executable/);
  assert.doesNotMatch(mainSource + hostSource, /exec\s*\(/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.match(preloadSource, /onEmbeddedMpvFrame/);
  assert.match(preloadSource, /webUtils\.getPathForFile/);
});


test('embedded MPV host treats renderer validation as an assertion, not a boolean predicate', () => {
  assert.match(mainSource, /assertTrustedRenderer,\s*\}/);
  assert.match(hostSource, /constructor\(\{ app, window, assertTrustedRenderer \}\)/);
  assert.match(hostSource, /this\.assertTrustedRenderer\(event\);/);
  assert.doesNotMatch(hostSource, /if\s*\(!this\.isTrustedRenderer\(event\)\)/);
  assert.match(hostSource, /intentionally returns undefined on success/);
});


test('native host preserves full startup errors and process exit diagnostics', () => {
  assert.match(hostSource, /parseNativeStatus/);
  assert.match(nativeStatusSource, /detailMatch = text\.match/);
  assert.match(hostSource, /lastEngineError = parsed\.detail/);
  assert.match(hostSource, /shouldReportProcessExit\(session, this\.activeSession\)/);
  assert.match(hostSource, /waitForChildExit\(child, 4500\)/);
  assert.match(hostSource, /child\.kill\('SIGTERM'\)/);
  assert.match(hostSource, /child\.kill\('SIGKILL'\)/);
  assert.match(hostSource, /this\.closePort\(session\.port\)/);
  assert.match(hostSource, /reason: this\.lastEngineError \|\| ''/);
  assert.match(playerSource, /const reason = typeof message\.reason === 'string'/);
  assert.match(playerSource, /موتور داخلی پخش متوقف شد: \$\{detail\}/);
});

test('native RGBA frames are fanned out to each desktop surface with shared ACK backpressure', () => {
  assert.match(hostSource, /target\.port\.postMessage\(\{[\s\S]*?data: frameBuffer,[\s\S]*?\}\);/);
  assert.doesNotMatch(hostSource, /target\.port\.postMessage\([\s\S]*?\},\s*\[data\.buffer\]\)/);
  assert.doesNotMatch(hostSource, /target\.port\.postMessage\([\s\S]*?\},\s*\[[^\]]+\]\)/);
  assert.match(hostSource, /Buffer\.allocUnsafeSlow\(count\)/);
  assert.match(hostSource, /session\.pendingFrameAcks/);
  assert.match(hostSource, /acknowledgeFrame\(session\)/);
  assert.match(hostSource, /session\.child\.stdin\.write\('frame-ack\\n'\)/);
});

test('native Windows PiP is an independent always-on-top window and keeps playback frames alive', () => {
  assert.match(mainSource, /new BrowserWindow\(\{[\s\S]*?frame: false,[\s\S]*?skipTaskbar: true,[\s\S]*?alwaysOnTop: true/);
  assert.match(mainSource, /setAlwaysOnTop\(true, 'screen-saver'\)/);
  assert.match(mainSource, /showInactive\(\)/);
  assert.match(mainSource, /attachFrameTarget\('pip'/);
  assert.match(mainSource, /setFrameOutputEnabled\(Boolean\(pipWindow && !pipWindow\.isDestroyed\(\)\)\)/);
  assert.match(mainSource, /assertTrustedPipRenderer/);
  assert.match(preloadSource, /setNativePictureInPicture/);
  assert.match(preloadSource, /onNativePictureInPictureState/);
  assert.match(hostSource, /attachFrameTarget\(id, targetWindow\)/);
  assert.match(hostSource, /detachFrameTarget\(id\)/);
  assert.match(pipPreloadSource, /aura:embedded-mpv-channel/);
  assert.match(pipPreloadSource, /postMessage\(\{ type: 'ack', sequence: frame\.sequence \}\)/);
  assert.match(pipHtmlSource, /id="pipCanvas"/);
  assert.match(pipPlayerSource, /context\.putImageData/);
  assert.match(pipPlayerSource, /toggle-pause/);
  assert.match(pipPlayerSource, /id="pipSeek"|pipSeek/);
  assert.match(playerSource, /setNativePictureInPicture/);
  assert.doesNotMatch(playerSource, /playerStage\.classList\.toggle\('is-picture-in-picture'\)/);
});

test('native render host uses libmpv Render API and outputs frames', () => {
  assert.match(nativeSource, /MPV_RENDER_API_TYPE_OPENGL/);
  assert.match(nativeSource, /mpv_render_context_create/);
  assert.match(nativeSource, /mpv_render_context_render/);
  assert.match(nativeSource, /glReadPixels/);
  assert.match(nativeSource, /emitEvent\(['"]loaded['"]\)/);
  assert.match(nativeSource, /--diagnose-codecs/);
  assert.match(nativeSource, /--verify-required-codecs/);
  assert.match(nativeSource, /missingRequired/);
  assert.match(cmakeSource, /pkg_check_modules\(MPV REQUIRED IMPORTED_TARGET mpv\)/);
  assert.match(cmakeSource, /SDL2/);
  assert.match(cmakeSource, /BUILD_RPATH \"\$ORIGIN\/lib\"/);
});


test('Linux SDL OpenGL initialization retries XWayland when Wayland context creation fails', () => {
  assert.match(nativeSource, /initializeSdlOpenGL\(\)/);
  assert.match(nativeSource, /candidates\.emplace_back\("wayland"\)/);
  assert.match(nativeSource, /candidates\.emplace_back\("x11"\)/);
  assert.match(nativeSource, /SDL_GL_CreateContext/);
  assert.match(nativeSource, /Could not initialize an SDL OpenGL context/);
  assert.match(nativeSource, /AURA_FATAL %s/);
});

test('native decoded frames are drawn in Aura Player original player surface', () => {
  assert.match(htmlSource, /<canvas id="nativeVideoCanvas"/);
  assert.match(playerSource, /nativeVideoContext\.putImageData/);
  assert.match(playerSource, /setEmbeddedMpvActive/);
  assert.match(playerSource, /commandEmbeddedMpv/);
  assert.doesNotMatch(playerSource, /setMpvExternalNotice/);
  assert.doesNotMatch(playerSource, /mpv-external-active/);
});

test('packaging fails closed when the target native runtime is not built', () => {
  assert.match(beforePackSource, /'native', 'dist'/);
  assert.match(beforePackSource, /path\.join\(dist, 'RUNTIME-LIBRARIES\.txt'\)/);
  assert.match(beforePackSource, /installer is intentionally blocked/i);
  assert.match(beforePackSource, /libmpv-2\.dll/);
  assert.match(beforePackSource, /RUNTIME-LIBRARIES\.txt/);
  assert.match(beforePackSource, /codec-inventory\.json/);
  assert.match(beforePackSource, /runtime-manifest\.json/);
  assert.match(beforePackSource, /createHash\('sha256'\)/);
  const buildScript = fs.readFileSync(path.join(root, 'scripts/build-native-engine.cjs'), 'utf8');
  assert.match(buildScript, /verifyBundledCodecs/);
  assert.match(buildScript, /REQUIRED_CODECS/);
  assert.match(buildScript, /--verify-required-codecs/);
});

test('offline codec diagnosis uses the bundled libmpv helper', () => {
  const diagnostic = fs.readFileSync(path.join(root, 'scripts/codec-diagnostics.cjs'), 'utf8');
  assert.match(diagnostic, /--diagnose-codecs/);
  assert.match(diagnostic, /missingRequired/);
  assert.match(diagnostic, /LD_LIBRARY_PATH/);
  assert.doesNotMatch(diagnostic, /runtime:prepare|mpv\.AppImage/);
});

test('Linux package metadata and desktop identity remain complete', () => {
  assert.match(packageJson.homepage, /^https:\/\//);
  assert.equal(packageJson.repository.url, 'https://github.com/arminabdijs/video-player.git');
  assert.equal(packageJson.author.name, 'Armin Abdi');
  assert.equal(packageJson.desktopName, packageJson.build.appId);
  assert.equal(packageJson.build.linux.syncDesktopName, true);
});

test('native host reports automatic hardware-decoder interop policy without claiming a backend is selected', () => {
  assert.match(hostSource, /Hardware-decoder interop: libmpv automatic discovery/);
  assert.match(hostSource, /parsed\.type === 'hwdec-interop-policy'/);
});


test('native frame transport reports acknowledged FPS and renderer ACK latency', () => {
  assert.match(hostSource, /Frame transport: .*acknowledged FPS; ACK avg/);
  assert.match(hostSource, /this\.awaitingSequence = sequence/);
  assert.match(hostSource, /Number\(message\.sequence\) !== this\.awaitingSequence/);
});
