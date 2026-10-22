const test = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/matroska-subtitles.js');

const reader = globalThis.AuraMatroskaSubtitleReader;
assert.ok(reader, 'Matroska subtitle reader should register its public API');

function idBytes(id) {
  const bytes = [];
  let value = id;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return Uint8Array.from(bytes);
}

function sizeVint(size) {
  for (let length = 1; length <= 8; length += 1) {
    if (size < (2 ** (7 * length)) - 1) {
      const bytes = new Uint8Array(length);
      let value = size;
      for (let index = length - 1; index >= 0; index -= 1) {
        bytes[index] = value & 0xff;
        value = Math.floor(value / 256);
      }
      bytes[0] |= 1 << (8 - length);
      return bytes;
    }
  }
  throw new RangeError('Fixture element is too large');
}

function element(id, payload) {
  const content = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const idPart = idBytes(id);
  const sizePart = sizeVint(content.length);
  const output = new Uint8Array(idPart.length + sizePart.length + content.length);
  output.set(idPart, 0);
  output.set(sizePart, idPart.length);
  output.set(content, idPart.length + sizePart.length);
  return output;
}

function unknownElement(id, payload) {
  const content = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const idPart = idBytes(id);
  const sizePart = Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const output = new Uint8Array(idPart.length + sizePart.length + content.length);
  output.set(idPart, 0);
  output.set(sizePart, idPart.length);
  output.set(content, idPart.length + sizePart.length);
  return output;
}

function concat(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function uint(value) {
  const bytes = [];
  do {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  } while (value > 0);
  return Uint8Array.from(bytes);
}

function str(value) {
  return new TextEncoder().encode(value);
}

function trackEntry({ number = 1, codec = 'S_TEXT/UTF8', language = 'eng', name = 'English', isDefault = true } = {}) {
  return element(0xae, concat(
    element(0xd7, uint(number)),
    element(0x83, uint(17)),
    element(0x86, str(codec)),
    element(0x22b59c, str(language)),
    element(0x536e, str(name)),
    element(0x88, uint(isDefault ? 1 : 0)),
  ));
}

function blockPayload(trackNumber, relativeTimecode, text, flags = 0) {
  return concat(
    Uint8Array.from([0x80 | trackNumber, (relativeTimecode >> 8) & 0xff, relativeTimecode & 0xff, flags]),
    str(text),
  );
}

function blockGroup(trackNumber, relativeTimecode, text, durationTicks, codec = 'S_TEXT/UTF8') {
  const payloadText = codec === 'S_TEXT/ASS'
    ? text
    : text;
  return element(0xa0, concat(
    element(0xa1, blockPayload(trackNumber, relativeTimecode, payloadText)),
    ...(durationTicks == null ? [] : [element(0x9b, uint(durationTicks))]),
  ));
}

function matroskaFile({ tracks, clusters, unknownSegment = false } = {}) {
  const info = element(0x1549a966, element(0x2ad7b1, uint(1000000)));
  const tracksElement = element(0x1654ae6b, concat(...tracks));
  const body = concat(info, tracksElement, ...clusters);
  return new Blob([
    element(0x1a45dfa3, new Uint8Array(0)),
    unknownSegment ? unknownElement(0x18538067, body) : element(0x18538067, body),
  ], { type: 'video/x-matroska' });
}

test('extracts an embedded UTF-8 subtitle track with timestamps and duration', async () => {
  const file = matroskaFile({
    tracks: [trackEntry()],
    clusters: [element(0x1f43b675, concat(
      element(0xe7, uint(5000)),
      blockGroup(1, 0, 'Hello embedded subtitle', 3000),
    ))],
  });
  const result = await reader.read(file);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].label, 'English · UTF8');
  assert.deepEqual(result.tracks[0].cues, [{ start: 5, end: 8, text: 'Hello embedded subtitle' }]);
});

test('handles an unknown-sized Segment and Cluster and infers missing cue duration', async () => {
  const firstCluster = unknownElement(0x1f43b675, concat(
    element(0xe7, uint(0)),
    blockGroup(1, 0, 'First cue', null),
  ));
  const secondCluster = element(0x1f43b675, concat(
    element(0xe7, uint(2000)),
    blockGroup(1, 0, 'Second cue', 1500),
  ));
  const file = matroskaFile({ tracks: [trackEntry()], clusters: [firstCluster, secondCluster], unknownSegment: true });
  const result = await reader.read(file);
  assert.equal(result.tracks[0].cues.length, 2);
  assert.deepEqual(result.tracks[0].cues, [
    { start: 0, end: 2, text: 'First cue' },
    { start: 2, end: 3.5, text: 'Second cue' },
  ]);
});

test('cleans Matroska ASS/SSA dialogue fields and converts line-break tags', async () => {
  const file = matroskaFile({
    tracks: [trackEntry({ codec: 'S_TEXT/ASS', language: 'fas', name: 'فارسی' })],
    clusters: [element(0x1f43b675, concat(
      element(0xe7, uint(0)),
      blockGroup(1, 0, '0,0,Default,,0,0,0,,{\\i1}سلام\\Nدنیا{\\i0}', 2000, 'S_TEXT/ASS'),
    ))],
  });
  const result = await reader.read(file);
  assert.equal(result.tracks[0].cues.length, 1);
  assert.equal(result.tracks[0].cues[0].text, 'سلام\nدنیا');
});

test('detects image-based PGS tracks but does not incorrectly parse them as text', async () => {
  const file = matroskaFile({
    tracks: [trackEntry({ codec: 'S_HDMV/PGS', language: 'und', name: 'Blu-ray subtitles' })],
    clusters: [],
  });
  const result = await reader.read(file);
  assert.equal(result.tracks.length, 0);
  assert.equal(result.unsupportedTracks.length, 1);
  assert.equal(result.unsupportedTracks[0].codec, 'S_HDMV/PGS');
});

test('reports a malformed/non-Matroska input rather than crashing the caller', async () => {
  await assert.rejects(() => reader.read(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])])), /Segment/);
});
