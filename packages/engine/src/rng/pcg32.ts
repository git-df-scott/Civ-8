/**
 * PCG32 (PCG-XSH-RR 64/32) — the engine's only source of randomness.
 *
 * - 64-bit state/increment implemented on 32-bit halves (Math.imul / >>>,
 *   no BigInt) — see doc 04 §3.3.
 * - Named substreams seeded via splitmix32(masterSeed XOR fnv1a(name)), so
 *   adding a draw to one stream never shifts any other stream.
 * - State is a plain serializable object so saves can persist RNG positions.
 */

import { add64, mul64, shl64, shr64, u64, xor64, type U64 } from '../internal/u64';

/** The PCG multiplier 6364136223846793005 as 32-bit halves. */
const PCG_MULT: U64 = u64(0x5851f42d, 0x4c957f2d);

/** Serializable PCG32 state. All four fields are unsigned 32-bit integers. */
export interface Pcg32State {
  readonly stateHi: number;
  readonly stateLo: number;
  readonly incHi: number;
  readonly incLo: number;
}

/** 32-bit FNV-1a over a string's UTF-16 code units (low byte, then high byte). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = Math.imul(hash ^ (unit & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (unit >>> 8), 0x01000193);
  }
  return hash >>> 0;
}

/** splitmix32 — used only to expand a 32-bit stream seed into PCG32 seed material. */
export function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return z >>> 0;
  };
}

export class Pcg32 {
  private state: U64;
  private readonly inc: U64;

  private constructor(state: U64, inc: U64) {
    this.state = state;
    this.inc = inc;
  }

  /** Reference pcg32_srandom_r seeding. */
  static seeded(seed: U64, seq: U64): Pcg32 {
    // inc = (seq << 1) | 1
    const shifted = shl64(seq, 1);
    const inc = u64(shifted.hi, shifted.lo | 1);
    const rng = new Pcg32(u64(0, 0), inc);
    rng.step();
    rng.state = add64(rng.state, seed);
    rng.step();
    return rng;
  }

  /**
   * A named substream of a master seed: seed material comes from
   * splitmix32(masterSeed XOR fnv1a32(name)) (doc 04 §3.3).
   */
  static stream(masterSeed: number, name: string): Pcg32 {
    const next = splitmix32((masterSeed ^ fnv1a32(name)) >>> 0);
    return Pcg32.seeded(u64(next(), next()), u64(next(), next()));
  }

  static fromState(s: Pcg32State): Pcg32 {
    return new Pcg32(u64(s.stateHi, s.stateLo), u64(s.incHi, s.incLo));
  }

  getState(): Pcg32State {
    return {
      stateHi: this.state.hi,
      stateLo: this.state.lo,
      incHi: this.inc.hi,
      incLo: this.inc.lo,
    };
  }

  private step(): void {
    this.state = add64(mul64(this.state, PCG_MULT), this.inc);
  }

  /** Next uniform unsigned 32-bit integer (PCG-XSH-RR output function). */
  nextUint32(): number {
    const old = this.state;
    this.step();
    // xorshifted = (uint32)(((old >> 18) ^ old) >> 27)
    const x = shr64(xor64(shr64(old, 18), old), 27);
    const xorshifted = x.lo >>> 0;
    // rot = old >> 59
    const rot = old.hi >>> 27;
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  }

  /** Unbiased integer in [0, bound) via the standard PCG bounded-rejection loop. */
  nextBounded(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0 || bound > 0xffffffff) {
      throw new RangeError(`nextBounded: bound must be an integer in [1, 2^32], got ${bound}`);
    }
    // threshold = (2^32 - bound) % bound, computed in doubles (exact: < 2^53).
    const threshold = (0x100000000 - bound) % bound;
    for (;;) {
      const r = this.nextUint32();
      if (r >= threshold) {
        return r % bound;
      }
    }
  }
}
