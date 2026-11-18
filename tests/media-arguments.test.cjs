'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  findMediaArgument,
  describeMediaFile,
  isSupportedMediaPath,
} = require('../desktop/media-arguments.cjs');

test('desktop launch arguments accept an absolute local media path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-open-with-'));
  try {
    const mediaPath = path.join(directory, 'A test video.mkv');
    fs.writeFileSync(mediaPath, 'media-placeholder');
    assert.equal(findMediaArgument(['--no-sandbox', '/app/Aura Player', mediaPath]), mediaPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('desktop launch arguments accept encoded file URLs and reject remote URLs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-open-with-url-'));
  try {
    const mediaPath = path.join(directory, 'sample clip.mp4');
    fs.writeFileSync(mediaPath, 'media-placeholder');
    assert.equal(findMediaArgument([pathToFileURL(mediaPath).href]), mediaPath);
    assert.equal(findMediaArgument(['https://example.com/video.mp4']), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('desktop launch arguments reject directories, missing paths and unrelated file types', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-open-with-invalid-'));
  try {
    const textPath = path.join(directory, 'notes.txt');
    fs.writeFileSync(textPath, 'not a video');
    assert.equal(findMediaArgument([directory]), null);
    assert.equal(findMediaArgument([textPath]), null);
    assert.equal(findMediaArgument([path.join(directory, 'missing.mp4')]), null);
    assert.equal(isSupportedMediaPath(path.join(directory, 'clip.HEVC')), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('media descriptors expose metadata only and never load media bytes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-open-with-meta-'));
  try {
    const mediaPath = path.join(directory, 'large-video.mp4');
    fs.writeFileSync(mediaPath, Buffer.alloc(1024));
    const descriptor = describeMediaFile(mediaPath);
    assert.equal(descriptor.path, mediaPath);
    assert.equal(descriptor.name, 'large-video.mp4');
    assert.equal(descriptor.size, 1024);
    assert.equal(descriptor.extension, 'mp4');
    assert.equal(Object.hasOwn(descriptor, 'data'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
