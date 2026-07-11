/**
 * Base64 for typed-array state (doc 04 §4: "typed arrays → base64").
 *
 * Own ~60-line implementation because the engine is environment-agnostic
 * with zero runtime dependencies: no Buffer (Node-only), no atob/btoa
 * (DOM/latin1 quirks). Standard alphabet, "=" padding, strict decode —
 * a corrupt save fails loudly, never silently truncates.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** ASCII code → 6-bit value; -1 marks characters outside the alphabet. */
const REVERSE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const full = bytes.length - (bytes.length % 3);
  for (let i = 0; i < full; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    parts.push(
      ALPHABET[(n >>> 18) & 63] as string,
      ALPHABET[(n >>> 12) & 63] as string,
      ALPHABET[(n >>> 6) & 63] as string,
      ALPHABET[n & 63] as string,
    );
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = (bytes[full] as number) << 16;
    parts.push(ALPHABET[(n >>> 18) & 63] as string, ALPHABET[(n >>> 12) & 63] as string, '==');
  } else if (rest === 2) {
    const n = ((bytes[full] as number) << 16) | ((bytes[full + 1] as number) << 8);
    parts.push(
      ALPHABET[(n >>> 18) & 63] as string,
      ALPHABET[(n >>> 12) & 63] as string,
      ALPHABET[(n >>> 6) & 63] as string,
      '=',
    );
  }
  return parts.join('');
}

/** Strict decode: throws RangeError on bad length, bad characters, or bad padding. */
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new RangeError(`base64ToBytes: length ${text.length} is not a multiple of 4`);
  }
  let padding = 0;
  if (text.endsWith('==')) {
    padding = 2;
  } else if (text.endsWith('=')) {
    padding = 1;
  }
  const byteLength = (text.length / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    let dataChars = 4;
    for (let j = 0; j < 4; j++) {
      const code = text.charCodeAt(i + j);
      if (code === 0x3d /* '=' */) {
        // '=' is legal only as the final padding of the final group.
        if (i + 4 !== text.length || j < 4 - padding) {
          throw new RangeError(`base64ToBytes: unexpected '=' at index ${i + j}`);
        }
        dataChars = j;
        n <<= 6 * (4 - j);
        break;
      }
      const value = code < 128 ? (REVERSE[code] as number) : -1;
      if (value < 0) {
        throw new RangeError(
          `base64ToBytes: invalid character ${JSON.stringify(text[i + j])} at index ${i + j}`,
        );
      }
      n = (n << 6) | value;
    }
    const groupBytes = dataChars === 4 ? 3 : dataChars === 3 ? 2 : 1;
    for (let b = 0; b < groupBytes; b++) {
      bytes[out++] = (n >>> (16 - 8 * b)) & 0xff;
    }
    // Non-zero discarded bits mean the encoding is non-canonical (corrupt).
    if (groupBytes < 3 && (n & (groupBytes === 2 ? 0xff : 0xffff)) !== 0) {
      throw new RangeError('base64ToBytes: non-canonical padding bits');
    }
  }
  return bytes;
}
