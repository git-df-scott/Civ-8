/**
 * Unsigned 64-bit integer arithmetic on pairs of unsigned 32-bit halves.
 *
 * The engine bans BigInt in hot paths (doc 04 §3.3), so 64-bit values are
 * represented as `{ hi, lo }` where both halves are unsigned 32-bit integers
 * (always normalized with `>>> 0`). Intermediate sums use doubles, which are
 * exact for integers below 2^53, so every operation here is bit-exact and
 * deterministic on every JS engine.
 */

export interface U64 {
  readonly hi: number;
  readonly lo: number;
}

export function u64(hi: number, lo: number): U64 {
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

/** (a + b) mod 2^64 */
export function add64(a: U64, b: U64): U64 {
  const lo = (a.lo >>> 0) + (b.lo >>> 0); // exact: < 2^33
  const hi = a.hi + b.hi + (lo > 0xffffffff ? 1 : 0);
  return u64(hi, lo);
}

/** (a * b) mod 2^64 */
export function mul64(a: U64, b: U64): U64 {
  // 32x32 -> 64 for the low halves, via 16-bit limbs (all intermediates < 2^53).
  const aLoLo = a.lo & 0xffff;
  const aLoHi = a.lo >>> 16;
  const bLoLo = b.lo & 0xffff;
  const bLoHi = b.lo >>> 16;

  const t00 = aLoLo * bLoLo; // < 2^32
  const mid = aLoHi * bLoLo + aLoLo * bLoHi + (t00 >>> 16); // < 2^34
  const lo = ((mid & 0xffff) << 16) | (t00 & 0xffff);
  const carry = aLoHi * bLoHi + Math.floor(mid / 0x10000); // high 32 bits of a.lo*b.lo

  // hi = high32(a.lo*b.lo) + a.lo*b.hi + a.hi*b.lo   (mod 2^32)
  const hi = carry + Math.imul(a.lo, b.hi) + Math.imul(a.hi, b.lo);
  return u64(hi, lo);
}

/** a XOR b */
export function xor64(a: U64, b: U64): U64 {
  return u64(a.hi ^ b.hi, a.lo ^ b.lo);
}

/** Logical right shift by n (0 < n < 64). */
export function shr64(a: U64, n: number): U64 {
  if (n >= 32) {
    return u64(0, a.hi >>> (n - 32));
  }
  return u64(a.hi >>> n, (a.lo >>> n) | (a.hi << (32 - n)));
}

/** Logical left shift by n (0 < n < 64). */
export function shl64(a: U64, n: number): U64 {
  if (n >= 32) {
    return u64(a.lo << (n - 32), 0);
  }
  return u64((a.hi << n) | (a.lo >>> (32 - n)), a.lo << n);
}

/** Render as a fixed-width 16-character lowercase hex string. */
export function toHex64(a: U64): string {
  return a.hi.toString(16).padStart(8, '0') + a.lo.toString(16).padStart(8, '0');
}
