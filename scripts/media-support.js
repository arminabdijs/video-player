'use strict';

(function registerAuraMediaSupport(root) {
  const VIDEO_EXTENSIONS = Object.freeze([
    '264', '265', '266', '3g2', '3gp', '3gpp', 'amv', 'asf', 'avi', 'av1', 'bik', 'dav',
    'divx', 'dv', 'dvr-ms', 'f4v', 'fli', 'flc', 'flv', 'gxf', 'h264', 'h265', 'hevc',
    'ivf', 'm1v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm3u8', 'm4v', 'mj2',
    'mk3d', 'mkv', 'mod', 'mov', 'mp2v', 'mp4', 'mpd', 'mpe', 'mpeg', 'mpeg1',
    'mpeg2', 'mpegts', 'mpg', 'mts', 'mxf', 'nsv', 'nut', 'ogm', 'ogv', 'rec',
    'qt', 'r3d', 'rm', 'rmvb', 'roq', 'smk', 'tod', 'ts', 'vdr', 'vob', 'vro', 'webm', 'wmv',
    'wtv', 'y4m', 'yuv',
  ]);

  const VIDEO_FILE_REGEX = new RegExp(`\\.(${VIDEO_EXTENSIONS.join('|')})$`, 'i');

  const CODEC_PROBES = Object.freeze({
    h264: [
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4; codecs="avc1.640028"',
    ],
    hevc: [
      'video/mp4; codecs="hvc1.1.6.L93.B0"',
      'video/mp4; codecs="hev1.1.6.L93.B0"',
    ],
    av1: ['video/mp4; codecs="av01.0.08M.08"'],
    vp9: ['video/webm; codecs="vp09.00.10.08"'],
    vp8: ['video/webm; codecs="vp8"'],
    mpeg4: ['video/mp4; codecs="mp4v.20.8"'],
    theora: ['video/ogg; codecs="theora"'],
    aac: ['audio/mp4; codecs="mp4a.40.2"'],
    opus: ['audio/webm; codecs="opus"'],
    vorbis: ['audio/ogg; codecs="vorbis"'],
    mp3: ['audio/mpeg; codecs="mp3"'],
    flac: ['audio/flac'],
  });

  function isVideoFile(fileOrName) {
    const name = typeof fileOrName === 'string'
      ? fileOrName
      : fileOrName?.name;

    return typeof name === 'string' && VIDEO_FILE_REGEX.test(name);
  }

  function probeType(mediaElement, mimeTypes) {
    if (!mediaElement || typeof mediaElement.canPlayType !== 'function') {
      return 'unknown';
    }

    let maybe = false;

    for (const mimeType of mimeTypes) {
      try {
        const result = mediaElement.canPlayType(mimeType);
        if (result === 'probably') return 'probably';
        if (result === 'maybe') maybe = true;
      } catch {
        // A codec probe must never prevent the file explorer from opening.
      }
    }

    return maybe ? 'maybe' : 'no';
  }

  function hasPresentedVideoFrame({ presentedFrames = 0, decodedFrames = 0, videoWidth = 0, videoHeight = 0, frameCallbackAvailable = false } = {}) {
    if (Number(presentedFrames) > 0 || Number(decodedFrames) > 0) return true;
    return !frameCallbackAvailable && Number(videoWidth) > 0 && Number(videoHeight) > 0;
  }

  function getBrowserCodecReport(videoElement, audioElement = videoElement) {
    return Object.fromEntries(
      Object.entries(CODEC_PROBES).map(([codec, mimeTypes]) => {
        const element = ['aac', 'opus', 'vorbis', 'mp3', 'flac'].includes(codec)
          ? audioElement
          : videoElement;

        return [codec, probeType(element, mimeTypes)];
      }),
    );
  }

  root.AuraMediaSupport = Object.freeze({
    VIDEO_EXTENSIONS,
    VIDEO_FILE_REGEX,
    CODEC_PROBES,
    isVideoFile,
    getBrowserCodecReport,
    hasPresentedVideoFrame,
  });
})(globalThis);
