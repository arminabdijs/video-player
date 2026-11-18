const test = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/media-support.js');
const { parseVideoDecoders, parseAudioDecoders } = require('../scripts/codec-diagnostics.cjs');

const mediaSupport = globalThis.AuraMediaSupport;

 test('recognizes common and less common video containers and elementary streams', () => {
  for (const name of [
    'movie.mkv', 'movie.mp4', 'movie.mov', 'movie.webm', 'movie.avi',
    'movie.m2ts', 'movie.mxf', 'movie.rmvb', 'movie.hevc', 'movie.h265',
    'movie.av1', 'movie.y4m', 'movie.3gp',
  ]) {
    assert.equal(mediaSupport.isVideoFile(name), true, `${name} should be accepted`);
  }
});

test('does not classify audio, subtitle, or unrelated files as video', () => {
  for (const name of ['track.flac', 'track.mp3', 'captions.srt', 'notes.txt', 'cover.jpg']) {
    assert.equal(mediaSupport.isVideoFile(name), false, `${name} should not be accepted`);
  }
});

test('codec probe distinguishes probably, maybe, and unsupported codecs', () => {
  const video = {
    canPlayType(mime) {
      if (mime.includes('avc1')) return 'probably';
      if (mime.includes('vp09')) return 'maybe';
      return '';
    },
  };
  const audio = {
    canPlayType(mime) {
      return mime.includes('mp4a') ? 'probably' : '';
    },
  };

  const report = mediaSupport.getBrowserCodecReport(video, audio);
  assert.equal(report.h264, 'probably');
  assert.equal(report.vp9, 'maybe');
  assert.equal(report.hevc, 'no');
  assert.equal(report.aac, 'probably');
  assert.equal(report.flac, 'no');
});

test('codec probe reports unknown when no media element is available', () => {
  const report = mediaSupport.getBrowserCodecReport(null, null);
  assert.equal(report.hevc, 'unknown');
  assert.equal(report.aac, 'unknown');
});


test('video output health check detects audio-only playback even when dimensions are known', () => {
  assert.equal(mediaSupport.hasPresentedVideoFrame({
    presentedFrames: 0,
    decodedFrames: 0,
    videoWidth: 1920,
    videoHeight: 1080,
    frameCallbackAvailable: true,
  }), false);
});

test('video output health check accepts presented or decoded frames', () => {
  assert.equal(mediaSupport.hasPresentedVideoFrame({ presentedFrames: 1, frameCallbackAvailable: true }), true);
  assert.equal(mediaSupport.hasPresentedVideoFrame({ decodedFrames: 12, frameCallbackAvailable: true }), true);
});

test('video dimensions are a fallback signal only when frame callbacks are unavailable', () => {
  assert.equal(mediaSupport.hasPresentedVideoFrame({
    videoWidth: 1280,
    videoHeight: 720,
    frameCallbackAvailable: false,
  }), true);
});


test('MPV decoder diagnostic parses prefixed FFmpeg decoder names', () => {
  const decoders = parseVideoDecoders([
    'Available video decoders:',
    '    lavc: h264 (H.264 / AVC)',
    '    lavc: hevc (HEVC / H.265)',
    '    lavc: av1 (AV1)',
    '    lavc: vp9 (Google VP9)',
  ].join('\n'));

  assert.equal(decoders.has('h264'), true);
  assert.equal(decoders.has('hevc'), true);
  assert.equal(decoders.has('av1'), true);
  assert.equal(decoders.has('vp9'), true);
  assert.equal(decoders.has('prores'), false);
});


test('MPV audio decoder diagnostic recognizes common audio decoders and aliases', () => {
  const decoders = parseAudioDecoders([
    'Available audio decoders:',
    '    lavc: aac (AAC)',
    '    lavc: mp3float (MP3)',
    '    lavc: flac (FLAC)',
    '    lavc: opus (Opus)',
    '    lavc: dca (DTS Coherent Acoustics)',
    '    lavc: mlp (MLP)',
  ].join('\n'));

  assert.equal(decoders.has('aac'), true);
  assert.equal(decoders.has('mp3float'), true);
  assert.equal(decoders.has('flac'), true);
  assert.equal(decoders.has('opus'), true);
  assert.equal(decoders.has('dca'), true);
  assert.equal(decoders.has('mlp'), true);
});


test('audio codec diagnostics recognizes concrete WMA decoders rather than a non-existent generic WMA alias', () => {
  const decoders = parseAudioDecoders([
    'Available audio decoders:',
    '    lavc: wmav1 (Windows Media Audio 1)',
    '    lavc: wmav2 (Windows Media Audio 2)',
    '    lavc: wmapro (Windows Media Audio Professional)',
    '    lavc: wmalossless (Windows Media Audio Lossless)',
    '    lavc: dca (DTS Coherent Acoustics)',
  ].join('\n'));
  assert.equal(decoders.has('wmav1'), true);
  assert.equal(decoders.has('wmav2'), true);
  assert.equal(decoders.has('wmapro'), true);
  assert.equal(decoders.has('wmalossless'), true);
  assert.equal(decoders.has('dca'), true);
  assert.equal(decoders.has('wma'), false);
});
