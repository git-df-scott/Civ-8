/**
 * 64-bit FNV-1a state hashing (doc 04 §3.4): the FNV-1a hash of the canonical
 * serialization is the determinism checksum used by replay tests, the sim
 * harness, and (later) multiplayer desync detection.
 *
 * This is the per-turn checksum — a future hot path — so the inner loop is
 * allocation-free: the 64-bit accumulator lives in four 16-bit limb locals
 * (h0 low … h3 high) and the multiply by the FNV-1a 64 prime 0x100000001b3
 * (= 2^40 + 0x1b3, i.e. limb products by 0x1b3 and by 0x100 shifted two
 * limbs up) is inlined. All intermediates stay well below 2^53, so every
 * step is bit-exact in doubles. Verified bit-identical to the previous
 * u64-object implementation.
 */

import { canonicalStringify } from './canonical';

/**
 * 64-bit FNV-1a over a string's UTF-16 code units (low byte, then high byte),
 * returned as a fixed-width 16-char lowercase hex string.
 */
export function fnv1a64Hex(text: string): string {
  // FNV-1a 64 offset basis 0xcbf29ce484222325 as 16-bit limbs (low → high).
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    let byte = unit & 0xff;
    for (let half = 0; half < 2; half++) {
      // hash ^= byte (only the low limb is affected).
      h0 ^= byte;
      // hash *= 0x100000001b3 (mod 2^64), limb by limb with carry.
      // limb k of the product = sum(h_i * p_j for i + j = k), where the
      // prime's nonzero limbs are p0 = 0x1b3 and p2 = 0x100 (h << 8, two
      // limbs up). Each term < 2^26, so (t >>> 16) carries are exact.
      let t = h0 * 0x1b3;
      const n0 = t & 0xffff;
      t = h1 * 0x1b3 + (t >>> 16);
      const n1 = t & 0xffff;
      t = h2 * 0x1b3 + (h0 << 8) + (t >>> 16);
      const n2 = t & 0xffff;
      t = h3 * 0x1b3 + (h1 << 8) + (t >>> 16);
      h0 = n0;
      h1 = n1;
      h2 = n2;
      h3 = t & 0xffff;
      byte = unit >>> 8;
    }
  }
  const hi = ((h3 << 16) | h2) >>> 0;
  const lo = ((h1 << 16) | h0) >>> 0;
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * 64-bit FNV-1a over raw bytes, same limb technique as fnv1a64Hex. Used to
 * fingerprint typed-array payloads (per-stage mapgen snapshots, PNG buffers)
 * without a string detour.
 */
export function fnv1a64HexBytes(bytes: Uint8Array): string {
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (let i = 0; i < bytes.length; i++) {
    h0 ^= bytes[i] as number;
    let t = h0 * 0x1b3;
    const n0 = t & 0xffff;
    t = h1 * 0x1b3 + (t >>> 16);
    const n1 = t & 0xffff;
    t = h2 * 0x1b3 + (h0 << 8) + (t >>> 16);
    const n2 = t & 0xffff;
    t = h3 * 0x1b3 + (h1 << 8) + (t >>> 16);
    h0 = n0;
    h1 = n1;
    h2 = n2;
    h3 = t & 0xffff;
  }
  const hi = ((h3 << 16) | h2) >>> 0;
  const lo = ((h1 << 16) | h0) >>> 0;
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/** Canonical 64-bit hash of any plain-data state value. */
export function hashState(state: unknown): string {
  return fnv1a64Hex(canonicalStringify(state));
}
