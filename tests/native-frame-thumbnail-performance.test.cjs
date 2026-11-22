'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('native frame readback no longer performs the extra CPU row flip', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  assert.match(source, /MPV_RENDER_PARAM_FLIP_Y/);
  assert.match(source, /frame-orientation.*native-fbo-readback-no-cpu-row-flip/);
  assert.doesNotMatch(source, /flipRows\s*\(/);
});

test('native playback uses asynchronous pixel-pack-buffer readback when supported', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  assert.match(source, /GL_PIXEL_PACK_BUFFER/);
  assert.match(source, /class PixelReadbackRing/);
  assert.match(source, /glReadPixels\(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, nullptr\)/);
  assert.match(source, /synchronous-fallback/);
});

test('desktop native output follows physical display pixels up to 4K', () => {
  const host = read('desktop/embedded-mpv-host.cjs');
  const script = read('scripts/script.js');
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(host, /MAX_RENDER_WIDTH = 3840/);
  assert.match(host, /MAX_RENDER_HEIGHT = 2160/);
  assert.match(script, /Math\.min\(3840/);
  assert.match(script, /Math\.min\(2160/);
  assert.match(script, /devicePixelRatio/);
  assert.match(native, /kMaxOutputWidth = 3840/);
  assert.match(native, /kMaxOutputHeight = 2160/);
});

test('native helper can decode a single poster frame without Chromium video decoding', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  const host = read('desktop/embedded-mpv-host.cjs');
  const main = read('desktop/main.cjs');
  const preload = read('desktop/preload.cjs');
  const script = read('scripts/script.js');
  assert.match(source, /--thumbnail/);
  assert.match(source, /decoding native poster frame/);
  assert.match(host, /async generateThumbnail\(/);
  assert.match(host, /'--thumbnail'/);
  assert.match(main, /aura:embedded-mpv-thumbnail/);
  assert.match(preload, /generateEmbeddedMpvThumbnail/);
  assert.match(script, /loadNativePosterForCard/);
  assert.match(script, /generateEmbeddedMpvThumbnail\(filePath/);
});


test('native frame loop preserves up to 60 decoded FPS with a single latest-frame PBO slot and adaptive polling', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  assert.match(source, /constexpr int kTargetFps = 60/);
  assert.match(source, /SDL_Delay\(outputEnabledNow && framePendingNow && !frameInFlightNow \? 1 : \(outputEnabledNow \? 4 : 8\)\)/);
  assert.match(source, /constexpr int kPboCount = 1/);
  const ring = source.match(/class PixelReadbackRing\s*\{([\s\S]*?)\n\};/);
  assert.ok(ring, 'PixelReadbackRing should exist');
  const enqueue = ring[1].match(/bool enqueueReadback\([\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(enqueue.includes('glReadPixels'));
  assert.doesNotMatch(enqueue, /bufferData/);
  assert.match(source, /const bool readbackPending = readback\.available\(\) && readback\.hasPending\(\)/);
  assert.match(source, /const bool frameSlotAvailable = readback\.available\(\)\s*\?\s*!readbackPending\s*:\s*!frameInFlight/);
  assert.match(source, /const bool frameDue = now - lastFrame >= frameInterval/);
  assert.match(source, /frameOutputEnabled && frameSlotAvailable && frameDue &&\s*g_frameDirty\.exchange\(false/);
});

test('desktop local files try Chromium first and retain libmpv as a real-world fallback', () => {
  const source = read('scripts/script.js');
  const host = read('desktop/embedded-mpv-host.cjs');
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(source, /async function startBrowserFirstDesktopPlayback\(/);
  assert.match(source, /startBrowserDesktopPlayback\(item, currentPlaybackRate\)/);
  assert.doesNotMatch(source, /navigator\.mediaCapabilities\.decodingInfo/);
  assert.match(source, /tryDesktopMpvFallback\(\)/);
  assert.match(source, /item\.externalPath \? item\.browserUrl : URL\.createObjectURL\(item\.file\)/);
  assert.match(native, /setOption\("hwdec-software-fallback", "yes"\)/);
  assert.match(host, /attachSessionFramePort/);
});

test('desktop native posters are persisted locally and bounded by a cache entry limit', () => {
  const host = read('desktop/embedded-mpv-host.cjs');
  assert.match(host, /thumbnail-cache/);
  assert.match(host, /createHash\('sha256'\)/);
  assert.match(host, /MAX_THUMBNAIL_CACHE_ENTRIES = 500/);
  assert.match(host, /pruneThumbnailCache/);
});


test('native renderer uses a high-precision intermediate framebuffer with graceful RGBA8 fallback', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  assert.match(source, /GL_RGBA16F/);
  assert.match(source, /attachAndCheck\(GL_RGBA16F, GL_FLOAT\)/);
  assert.match(source, /attachAndCheck\(GL_RGBA8, GL_UNSIGNED_BYTE\)/);
  assert.match(source, /framebuffer\.internalFormat/);
});

test('libmpv exposes adaptive quality profiles plus color-managed HDR-to-SDR output', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  for (const option of [
    'scale', 'lanczos', 'ewa_lanczossharp', 'cscale', 'bilinear', 'spline36',
    'dscale', 'mitchell', 'correct-downscaling', 'sigmoid-upscaling',
    'fbo-format', 'rgba16f', 'dither', 'fruit', 'dither-depth',
    'target-prim', 'bt.709', 'target-trc', 'srgb', 'tone-mapping',
    'bt.2390', 'target-peak', 'auto', 'deband', 'deinterlace',
  ]) assert.ok(source.includes(`"${option}"`), `missing quality option: ${option}`);
  assert.match(source, /low-power-balanced-lanczos-mitchell-rgba8-auto-threads/);
  assert.match(source, /setQualityOption\("deband", "no"\)/);
  assert.match(source, /setQualityOption\("interpolation", "no"\)/);
});

test('native output dynamically resizes after fullscreen and viewport changes', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  const host = read('desktop/embedded-mpv-host.cjs');
  const script = read('scripts/script.js');
  assert.match(host, /case 'resize'/);
  assert.match(source, /command == "resize"/);
  assert.match(source, /g_requestedSize/);
  assert.match(source, /video-output-resized/);
  assert.match(script, /new ResizeObserver\(requestNativeOutputResize\)/);
  assert.match(script, /type: 'resize'/);
});

test('transferred frame ArrayBuffer is wrapped directly without a second ImageData byte copy', () => {
  const source = read('scripts/script.js');
  assert.match(source, /new ImageData\(source, frame\.width, frame\.height, \{ colorSpace: 'srgb' \}\)/);
  assert.doesNotMatch(source, /nativeFrameImageData\.data\.set/);
});


test('native viewport scaling lets libmpv upscale low-resolution media before Canvas presentation', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  const helper = native.match(/std::pair<int, int> fitVideoOutputWithinBounds\([\s\S]*?return \{outputWidth, outputHeight\};\r?\n}/);
  assert.ok(helper, 'viewport aspect-fit helper should exist');
  assert.match(helper[0], /sourceAspect/);
  assert.match(helper[0], /boundsAspect/);
  assert.match(helper[0], /outputWidth = maxWidth/);
  assert.match(helper[0], /outputHeight = maxHeight/);
  assert.doesNotMatch(helper[0], /std::min\(\s*static_cast<double>\(maxWidth\).*sourceWidth/s);
  assert.match(native, /Render at the physical viewport resolution, not merely at the source's/);
});

test('Intel integrated GPUs use a lower-cost scaler while capable GPUs retain high-quality scaling', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /setQualityOption\("scale", "lanczos"\)/);
  assert.match(native, /setQualityOption\("cscale", "bilinear"\)/);
  assert.match(native, /setQualityOption\("scale", "ewa_lanczossharp"\)/);
  assert.match(native, /setQualityOption\("deband", "no"\)/);
  assert.match(native, /setQualityOption\("deband", "yes"\)/);
  assert.match(native, /setOption\("deinterlace", "auto"\)/);
});

test('linear-light downscaling is enabled only after a real RGBA16F framebuffer probe', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  const mainStart = native.indexOf('int main(');
  const probe = native.indexOf('const bool floatFramebufferSupported = framebuffer.internalFormat == GL_RGBA16F', mainStart);
  const init = native.indexOf('mpv_initialize(mpv)', mainStart);
  assert.ok(probe >= 0 && probe < init, 'precision probe must precede mpv initialization');
  assert.match(native, /if \(floatFramebufferSupported\)\s*\{[\s\S]*?setQualityOption\("fbo-format", "rgba16f"\);[\s\S]*?setQualityOption\("linear-downscaling", "yes"\);/);
  assert.match(native, /RGBA16F unavailable; using default libmpv FBO precision/);
  assert.doesNotMatch(native, /setQualityOption\("fbo-format", "rgba8"\)/);
});

test('HDR-to-SDR tone mapping uses mpv automatic SDR target peak instead of a fixed dim 100-nit target', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /setQualityOption\("target-peak", "auto"\)/);
  assert.doesNotMatch(native, /setQualityOption\("target-peak", "100"\)/);
});


test('native frame pipeline applies renderer ACK backpressure to the C++ render loop', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  const host = read('desktop/embedded-mpv-host.cjs');
  assert.match(native, /std::atomic<bool> g_frameInFlight/);
  assert.match(native, /command == "frame-ack"/);
  assert.match(native, /const bool frameInFlight = g_frameInFlight\.load\(std::memory_order_acquire\)/);
  assert.match(native, /g_frameInFlight\.store\(true, std::memory_order_release\)/);
  assert.match(native, /const bool readbackPending = readback\.available\(\) && readback\.hasPending\(\)/);
  assert.match(native, /const bool frameSlotAvailable = readback\.available\(\)\s*\?\s*!readbackPending\s*:\s*!frameInFlight/);
  assert.match(native, /const bool frameDue = now - lastFrame >= frameInterval/);
  assert.match(native, /const bool dirty = frameOutputEnabled && frameSlotAvailable && frameDue &&\s*g_frameDirty\.exchange/);
  assert.match(native, /constexpr int kPboCount = 1/);
  assert.match(native, /ACK must not cause the same still frame to be resent continuously/);
  assert.match(host, /session\.child\.stdin\.write\('frame-ack\\n'\)/);
});


test('native frame ACK gate is armed before stdout publishes the frame to avoid an ACK race', () => {
  const source = read('native/mpv-frame-host/main.cpp');
  const writeFrame = source.match(/bool writeFrame\(int width, int height, std::uint32_t sequence, const std::uint8_t \*pixels, bool waitForRendererAck = true\) \{([\s\S]*?)\n\}/);
  assert.ok(writeFrame, 'writeFrame overload should exist');
  const body = writeFrame[1];
  assert.ok(body.indexOf('g_frameInFlight.store(true') < body.indexOf('std::fwrite(&header'),
    'ACK gate must be armed before the first frame byte is written');
  assert.match(body, /if \(waitForRendererAck\) g_frameInFlight\.store\(false/);
});

test('native frame transport uses one tight Buffer allocation and avoids a second JavaScript byte copy', () => {
  const host = read('desktop/embedded-mpv-host.cjs');
  assert.match(host, /Buffer\.allocUnsafeSlow\(count\)/);
  assert.match(host, /data: frameBuffer/);
  assert.doesNotMatch(host, /new Uint8Array\(frame\.pixelData\.length\)/);
  assert.doesNotMatch(host, /data\.set\(frame\.pixelData\)/);
});

test('low-resource systems cap presentation to 1080p while preserving source-resolution decode', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /intelIntegratedGpu/);
  assert.match(native, /logicalCpuCount <= 4/);
  assert.match(native, /systemRamMb <= 8192/);
  assert.match(native, /softwareRenderer/);
  assert.match(native, /g_deviceMaxOutputWidth = 1920/);
  assert.match(native, /g_deviceMaxOutputHeight = 1080/);
  assert.match(native, /render-size-cap.*1920x1080-for-low-resource-device/);
  assert.match(native, /hwdec-current/);
});

test('native helper joins its command reader after the host closes stdin', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /Electron host sends quit and closes stdin/);
  assert.match(native, /reader\.join\(\)/);
  assert.doesNotMatch(native, /reader\.detach\(\)/);
});

test('native fallback is lazy and PiP does not duplicate full-rate frame copies into the dimmed main player', () => {
  const main = read('desktop/main.cjs');
  const script = read('scripts/script.js');
  const native = read('native/mpv-frame-host/main.cpp');

  assert.doesNotMatch(main, /embeddedMpv\.prewarm\(/);
  assert.match(script, /startBrowserFirstDesktopPlayback\(item, playbackGeneration\)/);
  assert.match(main, /embeddedMpv\.detachFrameTarget\('main'\)/);
  assert.match(main, /embeddedMpv\?\.attachFrameTarget\('main', mainWindow\)/);
  assert.match(native, /kTargetFps = 60/);
  assert.match(native, /const bool outputEnabledNow = g_frameOutputEnabled/);
  assert.match(native, /const bool framePendingNow = g_frameDirty/);
});


test('browser performance monitoring is passive and never switches engines for transient frame drops', () => {
  const script = read('scripts/script.js');
  const watchdogStart = script.indexOf('function startVideoFrameWatchdog()');
  const watchdogEnd = script.indexOf('function dispatchNativeMediaEvent', watchdogStart);
  const watchdog = watchdogStart >= 0 && watchdogEnd > watchdogStart
    ? script.slice(watchdogStart, watchdogEnd)
    : '';
  assert.ok(watchdog, 'browser playback watchdog should exist');
  assert.match(watchdog, /video\.readyState < HTMLMediaElement\.HAVE_FUTURE_DATA/);
  assert.match(watchdog, /playbackDegradedSampleCount >= 3/);
  assert.match(watchdog, /preserving the current engine/);
  assert.doesNotMatch(watchdog, /tryDesktopMpvFallback/);
  assert.doesNotMatch(watchdog, /requestVideoFrameCallback/);
  assert.match(script, /video\.addEventListener\('waiting', stopVideoFrameWatchdog\)/);
  assert.match(script, /video\.addEventListener\('stalled', stopVideoFrameWatchdog\)/);
});

test('desktop browser-first routing keeps Chromium selected unless the actual media element reports a fatal error', () => {
  const script = read('scripts/script.js');
  assert.match(script, /Browser-first playback/);
  assert.match(script, /videoElement\.preload = 'metadata'/);
  assert.match(script, /video\.addEventListener\('error'/);
  assert.match(script, /MediaError\.MEDIA_ERR_SRC_NOT_SUPPORTED \|\| code === MediaError\.MEDIA_ERR_DECODE/);
  assert.doesNotMatch(script, /desktopBrowserDecodeProfiles/);
  assert.doesNotMatch(script, /getPowerEfficientBrowserDecodeProfile/);
});

test('native fallback attempts are deduplicated per playback generation, not forever per File object', () => {
  const script = read('scripts/script.js');
  assert.match(script, /let desktopFallbackAttempt = null/);
  assert.match(script, /desktopFallbackAttempt\?\.generation === generation/);
  assert.match(script, /desktopFallbackAttempt = \{ generation, promise: attempt \}/);
  assert.match(script, /desktopFallbackAttempt = null;\s*stopVideoFrameWatchdog\(\)/);
  assert.doesNotMatch(script, /desktopFallbackAttempts/);
});

test('native low-resource rendering policy is based on CPU, RAM and software/integrated graphics, not Intel brand alone', () => {
  const native = read('native/mpv-frame-host/main.cpp');
  assert.match(native, /const unsigned int logicalCpuCount/);
  assert.match(native, /const int systemRamMb = SDL_GetSystemRAM\(\)/);
  assert.match(native, /const bool softwareRenderer/);
  assert.match(native, /const bool lowPowerDevice = logicalCpuCount <= 4/);
  assert.match(native, /g_deviceMaxOutputWidth = 1920/);
  assert.match(native, /g_deviceMaxOutputHeight = 1080/);
});
