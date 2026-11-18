'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  '.264', '.265', '.266', '.3g2', '.3gp', '.3gpp', '.amv', '.asf', '.avi', '.av1',
  '.bik', '.dav', '.divx', '.dv', '.dvr-ms', '.f4v', '.fli', '.flc', '.flv', '.gxf',
  '.h264', '.h265', '.hevc', '.ivf', '.m1v', '.m2p', '.m2t', '.m2ts', '.m2v', '.m3u8',
  '.m4v', '.mj2', '.mk3d', '.mkv', '.mod', '.mov', '.mp2v', '.mp4', '.mpd', '.mpe',
  '.mpeg', '.mpeg1', '.mpeg2', '.mpegts', '.mpg', '.mts', '.mxf', '.nsv', '.nut',
  '.ogm', '.ogv', '.qt', '.r3d', '.rec', '.rm', '.rmvb', '.roq', '.smk', '.tod', '.ts',
  '.vdr', '.vob', '.vro', '.webm', '.wmv', '.wtv', '.y4m', '.yuv',
]);

function toLocalMediaPath(argument) {
  if (typeof argument !== 'string') return null;
  const value = argument.trim();
  if (!value || value.startsWith('-')) return null;

  try {
    if (/^file:/i.test(value)) {
      const url = new URL(value);
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return null;
      return fileURLToPath(url);
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return null;
    return path.resolve(value);
  } catch {
    return null;
  }
}

function isSupportedMediaPath(filePath) {
  return typeof filePath === 'string' && SUPPORTED_MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function findMediaArgument(args, statSync = fs.statSync) {
  for (const argument of args || []) {
    const candidate = toLocalMediaPath(argument);
    if (!candidate || !isSupportedMediaPath(candidate)) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Electron executable flags, app paths and stale file-manager selections are ignored.
    }
  }
  return null;
}

function describeMediaFile(filePath, statSync = fs.statSync) {
  const candidate = toLocalMediaPath(filePath);
  if (!candidate || !isSupportedMediaPath(candidate)) return null;
  try {
    const info = statSync(candidate);
    if (!info.isFile()) return null;
    return {
      path: candidate,
      name: path.basename(candidate),
      size: Number(info.size) || 0,
      lastModified: Number.isFinite(info.mtimeMs) ? Math.trunc(info.mtimeMs) : Date.now(),
      extension: path.extname(candidate).slice(1).toLowerCase(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  SUPPORTED_MEDIA_EXTENSIONS,
  toLocalMediaPath,
  isSupportedMediaPath,
  findMediaArgument,
  describeMediaFile,
};
