'use strict';

/**
 * Parse the native helper's one-line status protocol.
 * `detail` is deliberately the final field and may contain whitespace,
 * punctuation, or `=` characters from the original C++ exception text.
 */
function parseNativeStatus(source) {
  const values = {};
  const text = String(source ?? '');
  const detailMatch = text.match(/(?:^|\s)detail=(.*)$/);
  const keyValueSource = detailMatch
    ? text.slice(0, detailMatch.index).trim()
    : text;

  for (const match of keyValueSource.matchAll(/([a-zA-Z0-9_-]+)=([^\s]*)/g)) {
    const [, key, raw] = match;
    if (raw === 'true' || raw === 'yes') values[key] = true;
    else if (raw === 'false' || raw === 'no') values[key] = false;
    else if (raw !== '' && Number.isFinite(Number(raw))) values[key] = Number(raw);
    else values[key] = raw;
  }

  if (detailMatch) values.detail = detailMatch[1];
  return values;
}

module.exports = { parseNativeStatus };
