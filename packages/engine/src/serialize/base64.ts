/**
 * Base64 for typed-array state (doc 04 §3.4: "typed arrays → base64").
 * Hand-rolled because the engine is a pure library: no Buffer (Node), no
 * atob/btoa (DOM). Standard alphabet, '=' padding, strict decoding — a save
 * with a malformed byte string must fail loudly, not round to garbage.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup: char code → 6-bit value, -1 for invalid characters. */
const REVERSE: readonly number[] = (() => {
  const table = new Array<number>(128).fill(-1);
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

/** Strict decode: throws TypeError on bad length, bad characters, or bad padding. */
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new TypeError(`base64ToBytes: length ${text.length} is not a multiple of 4`);
  }
  let padding = 0;
  if (text.endsWith('==')) {
    padding = 2;
  } else if (text.endsWith('=')) {
    padding = 1;
  }
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    let chars = 4;
    if (i + 4 === text.length) {
      chars = 4 - padding;
    }
    for (let j = 0; j < chars; j++) {
      const code = text.charCodeAt(i + j);
      const value = code < 128 ? (REVERSE[code] as number) : -1;
      if (value < 0) {
        throw new TypeError(`base64ToBytes: invalid character at position ${i + j}`);
      }
      n |= value << (18 - 6 * j);
    }
    bytes[out] = (n >>> 16) & 0xff;
    if (chars > 2) {
      bytes[out + 1] = (n >>> 8) & 0xff;
    } else if ((n & 0xffff) !== 0) {
      throw new TypeError('base64ToBytes: non-zero padding bits');
    }
    if (chars > 3) {
      bytes[out + 2] = n & 0xff;
    } else if (chars === 3 && (n & 0xff) !== 0) {
      throw new TypeError('base64ToBytes: non-zero padding bits');
    }
    out += chars - 1;
  }
  return bytes;
}
