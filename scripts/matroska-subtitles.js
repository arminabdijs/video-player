/*
 * Lightweight Matroska subtitle-track reader for Aura Player Pro.
 *
 * Reads Matroska/EBML structure through Blob.slice() and skips audio/video
 * payloads instead of loading an entire movie into memory. Text codecs:
 * S_TEXT/UTF8, S_TEXT/ASS, S_TEXT/SSA and S_TEXT/WEBVTT.
 * Image-based PGS/VobSub tracks are reported as unsupported, not silently
 * treated as readable text.
 */
(function attachMatroskaSubtitleReader(root) {
  'use strict';

  const IDS = Object.freeze({
    SEGMENT: 0x18538067,
    INFO: 0x1549A966,
    TIMECODE_SCALE: 0x2AD7B1,
    TRACKS: 0x1654AE6B,
    TRACK_ENTRY: 0xAE,
    TRACK_NUMBER: 0xD7,
    TRACK_TYPE: 0x83,
    CODEC_ID: 0x86,
    LANGUAGE: 0x22B59C,
    LANGUAGE_IETF: 0x22B59D,
    TRACK_NAME: 0x536E,
    FLAG_DEFAULT: 0x88,
    FLAG_FORCED: 0x55AA,
    CLUSTER: 0x1F43B675,
    CLUSTER_TIMECODE: 0xE7,
    SIMPLE_BLOCK: 0xA3,
    BLOCK_GROUP: 0xA0,
    BLOCK: 0xA1,
    BLOCK_DURATION: 0x9B,
  });

  const TOP_LEVEL_IDS = new Set([
    IDS.INFO,
    IDS.TRACKS,
    IDS.CLUSTER,
    0x114D9B74, // SeekHead
    0x1C53BB6B, // Cues
    0x1941A469, // Attachments
    0x1043A770, // Chapters
    0x1254C367, // Tags
  ]);

  const SUPPORTED_CODECS = new Set([
    'S_TEXT/UTF8',
    'S_TEXT/ASS',
    'S_TEXT/SSA',
    'S_TEXT/WEBVTT',
  ]);

  class BlobRangeReader {
    constructor(blob, chunkSize = 1024 * 1024) {
      this.blob = blob;
      this.size = blob.size;
      this.chunkSize = chunkSize;
      this.cacheStart = -1;
      this.cache = new Uint8Array(0);
    }

    async loadChunk(offset) {
      const start = Math.floor(offset / this.chunkSize) * this.chunkSize;
      const end = Math.min(this.size, start + this.chunkSize);
      this.cache = new Uint8Array(await this.blob.slice(start, end).arrayBuffer());
      this.cacheStart = start;
    }

    async read(offset, length) {
      const start = Math.max(0, Math.floor(offset));
      const count = Math.max(0, Math.floor(length));
      if (!count || start >= this.size) return new Uint8Array(0);

      const actualLength = Math.min(count, this.size - start);
      const output = new Uint8Array(actualLength);
      let copied = 0;

      while (copied < actualLength) {
        const cursor = start + copied;
        if (cursor < this.cacheStart || cursor >= this.cacheStart + this.cache.length) {
          await this.loadChunk(cursor);
        }

        const localOffset = cursor - this.cacheStart;
        const available = this.cache.length - localOffset;
        const take = Math.min(available, actualLength - copied);
        if (take <= 0) break;

        output.set(this.cache.subarray(localOffset, localOffset + take), copied);
        copied += take;
      }

      return copied === output.length ? output : output.subarray(0, copied);
    }

    async header(offset, limit = this.size) {
      if (offset < 0 || offset >= limit || offset >= this.size) return null;
      const bytes = await this.read(offset, Math.min(12, limit - offset));
      const id = readVint(bytes, 0, true, 4);
      if (!id || id.length > 4) return null;

      const size = readVint(bytes, id.length, false, 8);
      if (!size) return null;

      const payloadStart = offset + id.length + size.length;
      const unknown = isUnknownSize(bytes, id.length, size.length);
      const end = unknown ? null : payloadStart + size.value;

      if (!unknown && (!Number.isFinite(end) || end < payloadStart)) return null;

      return {
        id: id.value,
        size: unknown ? null : size.value,
        unknown,
        start: offset,
        payloadStart,
        end,
        headerLength: id.length + size.length,
      };
    }

    async uint(offset, length) {
      const bytes = await this.read(offset, length);
      let value = 0;
      for (const byte of bytes) value = value * 256 + byte;
      return value;
    }

    async string(offset, length) {
      const bytes = await this.read(offset, Math.min(length, 2 * 1024 * 1024));
      return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '').trim();
    }
  }

  function vintLength(firstByte, maxLength = 8) {
    if (!Number.isInteger(firstByte) || firstByte <= 0) return 0;
    for (let index = 0; index < maxLength; index += 1) {
      if (firstByte & (0x80 >> index)) return index + 1;
    }
    return 0;
  }

  function readVint(bytes, offset, keepMarker, maxLength = 8) {
    if (offset >= bytes.length) return null;
    const length = vintLength(bytes[offset], maxLength);
    if (!length || offset + length > bytes.length) return null;

    const firstMask = keepMarker ? 0xFF : (0xFF >> length);
    let value = bytes[offset] & firstMask;
    for (let index = 1; index < length; index += 1) {
      value = value * 256 + bytes[offset + index];
    }

    return { value, length };
  }

  function isUnknownSize(bytes, offset, length) {
    if (length < 1 || offset + length > bytes.length) return false;
    const firstAllOnes = 0xFF >> (length - 1);
    if (bytes[offset] !== firstAllOnes) return false;
    for (let index = 1; index < length; index += 1) {
      if (bytes[offset + index] !== 0xFF) return false;
    }
    return true;
  }

  function decodeUnsignedVint(bytes, offset = 0) {
    const vint = readVint(bytes, offset, false, 8);
    return vint ? { number: vint.value, length: vint.length } : null;
  }

  async function readUnsignedElement(reader, element) {
    if (!element || !Number.isFinite(element.size) || element.size < 1 || element.size > 8) return 0;
    return reader.uint(element.payloadStart, element.size);
  }

  async function walkChildren(reader, start, end, visit) {
    let cursor = start;
    while (cursor < end) {
      const element = await reader.header(cursor, end);
      if (!element) break;
      if (element.unknown) break;
      const next = element.end;
      if (next <= cursor || next > end) break;
      await visit(element);
      cursor = next;
    }
  }

  async function readInfo(reader, element) {
    let timecodeScale = 1000000;
    await walkChildren(reader, element.payloadStart, element.end, async (child) => {
      if (child.id === IDS.TIMECODE_SCALE) {
        const value = await readUnsignedElement(reader, child);
        if (value > 0) timecodeScale = value;
      }
    });
    return timecodeScale;
  }

  async function readTrackEntry(reader, entry) {
    const track = {
      number: 0,
      type: 0,
      codec: '',
      language: '',
      name: '',
      isDefault: false,
      isForced: false,
      cues: [],
      supported: false,
    };

    await walkChildren(reader, entry.payloadStart, entry.end, async (child) => {
      switch (child.id) {
        case IDS.TRACK_NUMBER:
          track.number = await readUnsignedElement(reader, child);
          break;
        case IDS.TRACK_TYPE:
          track.type = await readUnsignedElement(reader, child);
          break;
        case IDS.CODEC_ID:
          track.codec = await reader.string(child.payloadStart, child.size);
          break;
        case IDS.LANGUAGE:
        case IDS.LANGUAGE_IETF:
          if (!track.language) track.language = await reader.string(child.payloadStart, child.size);
          break;
        case IDS.TRACK_NAME:
          track.name = await reader.string(child.payloadStart, child.size);
          break;
        case IDS.FLAG_DEFAULT:
          track.isDefault = (await readUnsignedElement(reader, child)) === 1;
          break;
        case IDS.FLAG_FORCED:
          track.isForced = (await readUnsignedElement(reader, child)) === 1;
          break;
        default:
          break;
      }
    });

    track.supported = track.type === 17 && SUPPORTED_CODECS.has(track.codec);
    track.language = track.language || 'und';
    track.label = buildTrackLabel(track);
    return track;
  }

  function languageLabel(code) {
    const language = String(code || '').toLowerCase().split('-')[0];
    const labels = {
      fa: 'فارسی', fas: 'فارسی', per: 'فارسی',
      en: 'English', eng: 'English',
      ar: 'العربية', ara: 'العربية',
      tr: 'Türkçe', tur: 'Türkçe',
      ku: 'کوردی', kur: 'کوردی',
      ja: '日本語', jpn: '日本語',
      ko: '한국어', kor: '한국어',
      zh: '中文', zho: '中文', chi: '中文',
      fr: 'Français', fra: 'Français', fre: 'Français',
      de: 'Deutsch', deu: 'Deutsch', ger: 'Deutsch',
      es: 'Español', spa: 'Español',
      und: 'زبان نامشخص',
    };
    return labels[language] || (language === 'und' ? 'زبان نامشخص' : code);
  }

  function buildTrackLabel(track) {
    const parts = [];
    if (track.name) parts.push(track.name);
    const translatedLanguage = languageLabel(track.language);
    if (translatedLanguage && !parts.some((part) => part.toLowerCase() === translatedLanguage.toLowerCase())) {
      parts.push(translatedLanguage);
    }
    const codecShort = track.codec.replace(/^S_TEXT\//, '');
    if (codecShort) parts.push(codecShort);
    return parts.join(' · ') || `ترک ${track.number}`;
  }

  async function readTracks(reader, element) {
    const tracks = [];
    await walkChildren(reader, element.payloadStart, element.end, async (child) => {
      if (child.id === IDS.TRACK_ENTRY && !child.unknown) {
        const track = await readTrackEntry(reader, child);
        if (track.number && track.type === 17) tracks.push(track);
      }
    });
    return tracks;
  }

  async function findUnknownClusterEnd(reader, start, limit) {
    let cursor = start;
    while (cursor < limit) {
      const element = await reader.header(cursor, limit);
      if (!element) return limit;

      // These are Segment children and cannot be direct Cluster children.
      if (TOP_LEVEL_IDS.has(element.id)) return cursor;
      if (element.unknown || !Number.isFinite(element.end) || element.end <= cursor || element.end > limit) {
        return limit;
      }
      cursor = element.end;
    }
    return limit;
  }

  async function locateSegment(reader) {
    let cursor = 0;
    while (cursor < reader.size) {
      const element = await reader.header(cursor, reader.size);
      if (!element) break;
      if (element.id === IDS.SEGMENT) {
        return {
          payloadStart: element.payloadStart,
          end: element.unknown ? reader.size : Math.min(element.end, reader.size),
        };
      }
      if (element.unknown || !Number.isFinite(element.end) || element.end <= cursor) break;
      cursor = element.end;
    }
    throw new Error('ساختار Segment در فایل MKV پیدا نشد.');
  }

  async function scanSegment(reader, segment, signal) {
    let cursor = segment.payloadStart;
    let timecodeScale = 1000000;
    let tracks = [];
    const clusters = [];

    while (cursor < segment.end) {
      if (signal?.aborted) return { timecodeScale, tracks, clusters, aborted: true };
      const element = await reader.header(cursor, segment.end);
      if (!element) break;

      let end = element.end;
      if (element.unknown) {
        if (element.id === IDS.CLUSTER) {
          end = await findUnknownClusterEnd(reader, element.payloadStart, segment.end);
        } else {
          end = segment.end;
        }
      }

      if (!Number.isFinite(end) || end <= cursor || end > segment.end) break;

      if (element.id === IDS.INFO && !element.unknown) {
        timecodeScale = await readInfo(reader, element);
      } else if (element.id === IDS.TRACKS && !element.unknown) {
        tracks = await readTracks(reader, element);
      } else if (element.id === IDS.CLUSTER) {
        clusters.push({ start: element.payloadStart, end });
      }

      cursor = end;
    }

    return { timecodeScale, tracks, clusters, aborted: false };
  }

  async function readBlockGroup(reader, group) {
    let block = null;
    let durationTicks = null;

    await walkChildren(reader, group.payloadStart, group.end, async (child) => {
      if (child.id === IDS.BLOCK && !child.unknown) {
        block = { payloadStart: child.payloadStart, size: child.size, durationTicks: null };
      } else if (child.id === IDS.BLOCK_DURATION) {
        durationTicks = await readUnsignedElement(reader, child);
      }
    });

    if (block) block.durationTicks = durationTicks;
    return block;
  }

  async function collectClusterBlocks(reader, cluster) {
    let cursor = cluster.start;
    let clusterTimecode = 0;
    const blocks = [];

    while (cursor < cluster.end) {
      const element = await reader.header(cursor, cluster.end);
      if (!element || element.unknown || element.end <= cursor || element.end > cluster.end) break;

      if (element.id === IDS.CLUSTER_TIMECODE) {
        clusterTimecode = await readUnsignedElement(reader, element);
      } else if (element.id === IDS.SIMPLE_BLOCK && element.size > 0) {
        blocks.push({ payloadStart: element.payloadStart, size: element.size, durationTicks: null });
      } else if (element.id === IDS.BLOCK_GROUP) {
        const block = await readBlockGroup(reader, element);
        if (block) blocks.push(block);
      }
      cursor = element.end;
    }

    return { clusterTimecode, blocks };
  }

  function decodeSubtitlePayload(codec, input) {
    let text = new TextDecoder('utf-8').decode(input).replace(/^\uFEFF/, '').replace(/\0+$/g, '').trim();
    if (!text) return '';

    if (codec === 'S_TEXT/ASS' || codec === 'S_TEXT/SSA') {
      const hasDialoguePrefix = /^Dialogue:\s*/i.test(text);
      text = text.replace(/^Dialogue:\s*/i, '');
      const fields = text.split(',');
      // A full ASS Dialogue line has 10 fields; Matroska commonly stores
      // only ReadOrder, Layer, Style, Name, margins, Effect and Text (9 fields).
      if (hasDialoguePrefix && fields.length >= 10) text = fields.slice(9).join(',');
      else if (!hasDialoguePrefix && fields.length >= 9) text = fields.slice(8).join(',');
      text = text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ')
        .replace(/\\,/g, ',');
    } else if (codec === 'S_TEXT/WEBVTT') {
      text = text
        .replace(/^WEBVTT[^\n]*\n+/i, '')
        .replace(/^\d+\s*\n/, '')
        .replace(/<\/?(?:i|b|u|c(?:\.[^>]*)?|font|ruby|rt)[^>]*>/gi, '')
        .replace(/<[^>]*>/g, '');
    }

    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  async function blockToCue(reader, block, clusterTimecode, timecodeScale, trackMap) {
    if (!block || block.size < 4) return null;
    const head = await reader.read(block.payloadStart, Math.min(block.size, 20));
    const trackVint = decodeUnsignedVint(head, 0);
    if (!trackVint || head.length < trackVint.length + 3) return null;

    const track = trackMap.get(trackVint.number);
    if (!track || !track.supported) return null;

    const timeOffset = trackVint.length;
    const relativeTimecode = (head[timeOffset] << 8) | head[timeOffset + 1];
    const signedRelative = relativeTimecode & 0x8000 ? relativeTimecode - 0x10000 : relativeTimecode;
    const flags = head[timeOffset + 2];

    // Laced subtitle blocks are uncommon and codec-specific; don't misread them.
    if ((flags & 0x06) !== 0) {
      track.hasSkippedLacedBlocks = true;
      return null;
    }

    const blockHeaderLength = trackVint.length + 3;
    const textLength = block.size - blockHeaderLength;
    if (textLength <= 0 || textLength > 1024 * 1024) return null;

    const textBytes = await reader.read(block.payloadStart + blockHeaderLength, textLength);
    const text = decodeSubtitlePayload(track.codec, textBytes);
    if (!text) return null;

    const start = Math.max(0, (clusterTimecode + signedRelative) * timecodeScale / 1000000000);
    const duration = block.durationTicks > 0 ? block.durationTicks * timecodeScale / 1000000000 : 0;

    const cue = {
      start,
      end: duration > 0 ? start + duration : start + 4,
      durationMissing: duration <= 0,
      text,
    };

    return { trackNumber: track.number, cue };
  }

  function finalizeCues(cues) {
    cues.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];

    for (const cue of cues) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.start - cue.start) < 0.005) {
        if (cue.text && cue.text !== last.text && !last.text.includes(cue.text)) {
          last.text = `${last.text}\n${cue.text}`;
        }
        last.end = Math.max(last.end, cue.end);
        last.durationMissing = Boolean(last.durationMissing && cue.durationMissing);
      } else {
        merged.push({ start: cue.start, end: cue.end, text: cue.text, durationMissing: cue.durationMissing });
      }
    }

    for (let index = 0; index < merged.length; index += 1) {
      const cue = merged[index];
      const next = merged[index + 1];
      if (cue.durationMissing || !Number.isFinite(cue.end) || cue.end <= cue.start + 0.01) {
        cue.end = next && next.start > cue.start ? Math.min(cue.start + 8, next.start) : cue.start + 4;
      }
      delete cue.durationMissing;
      if (next && cue.end > next.start && next.start > cue.start) {
        cue.end = next.start;
      }
    }

    cues.splice(0, cues.length, ...merged);
  }

  async function readMatroskaSubtitles(file, options = {}) {
    if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size) || file.size < 8) {
      throw new TypeError('فایل ورودی معتبر نیست.');
    }

    const { onTracks, onCues, onProgress, signal } = options;
    const reader = new BlobRangeReader(file);
    const segment = await locateSegment(reader);
    const metadata = await scanSegment(reader, segment, signal);
    if (metadata.aborted || signal?.aborted) return { tracks: [], unsupportedTracks: [], aborted: true };

    const allTracks = metadata.tracks;
    const tracks = allTracks.filter((track) => track.supported);
    const unsupportedTracks = allTracks.filter((track) => !track.supported);
    const trackMap = new Map(tracks.map((track) => [track.number, track]));

    if (typeof onTracks === 'function') onTracks(tracks, unsupportedTracks);
    if (!tracks.length) return { tracks, unsupportedTracks, aborted: false };

    for (let clusterIndex = 0; clusterIndex < metadata.clusters.length; clusterIndex += 1) {
      if (signal?.aborted) return { tracks, unsupportedTracks, aborted: true };

      const cluster = metadata.clusters[clusterIndex];
      const parsedCluster = await collectClusterBlocks(reader, cluster);
      const newCuesByTrack = new Map();

      for (const block of parsedCluster.blocks) {
        const parsed = await blockToCue(reader, block, parsedCluster.clusterTimecode, metadata.timecodeScale, trackMap);
        if (!parsed) continue;

        const number = parsed.trackNumber;
        const cue = parsed.cue;
        const track = trackMap.get(number);
        if (!track) continue;

        track.cues.push(cue);
        if (!newCuesByTrack.has(number)) newCuesByTrack.set(number, []);
        newCuesByTrack.get(number).push(cue);
      }

      for (const [number, batch] of newCuesByTrack) {
        batch.sort((a, b) => a.start - b.start);
        if (typeof onCues === 'function') onCues(trackMap.get(number), batch, false);
      }

      if (typeof onProgress === 'function') onProgress(clusterIndex + 1, metadata.clusters.length);
      // Allow playback and controls to remain responsive on long movies.
      if (clusterIndex % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    for (const track of tracks) {
      finalizeCues(track.cues);
      if (typeof onCues === 'function') onCues(track, track.cues, true);
    }

    return { tracks, unsupportedTracks, aborted: false };
  }


  root.AuraMatroskaSubtitleReader = {
    read: readMatroskaSubtitles,
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
