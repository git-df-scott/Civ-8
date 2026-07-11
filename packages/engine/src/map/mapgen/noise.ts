/**
 * Integer value noise — the engine's own ~80-line implementation (doc 04 §4:
 * "integer-seeded noise, no float-seeded npm libs").
 *
 * A lattice of pseudo-random 16-bit values (an avalanche integer hash of
 * lattice coordinates + a salt drawn from the stage's RNG substream) is
 * bilinearly interpolated with a smoothstep in 16.16 fixed point. Every
 * intermediate stays below 2^53, so all math is bit-exact in doubles —
 * no floats anywhere (docs/determinism.md §2).
 *
 * The lattice is periodic in x with period `cellsX`, so noise wraps
 * seamlessly across the cylinder seam for ANY map width: sample positions
 * are scaled into lattice space by integer division (q·cellsX·FP / width).
 */

import type { Pcg32 } from '../../rng/pcg32';

const FP = 65536; // 16.16 fixed point

/** Avalanche hash of (x, y, salt) → uint32. Deterministic, allocation-free. */
export function hashLattice(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 0x27d4eb2f) ^ Math.imul(y, 0x165667b1) ^ salt) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Smoothstep t²(3−2t) in 16.16 fixed point; t ∈ [0, FP) → [0, FP]. */
function smooth(t: number): number {
  // t² ≤ 2^32; (3·FP − 2t) < 2^18 ⇒ product < 2^50: exact in doubles.
  return Math.floor((t * t * (3 * FP - 2 * t)) / (FP * FP));
}

/** lerp a→b by s ∈ [0, FP]; a, b ∈ [0, 65535]. */
function lerp(a: number, b: number, s: number): number {
  return a + Math.floor(((b - a) * s) / FP);
}

export interface NoiseOctave {
  /** Lattice cells across the map width (x-period — wraps the cylinder). */
  readonly cellsX: number;
  /** Lattice cells down the map height. */
  readonly cellsY: number;
  /** Per-octave salt, drawn from the stage's RNG substream. */
  readonly salt: number;
  /** Relative weight (integer). */
  readonly weight: number;
}

/** One octave of periodic value noise at tile (q, r) → [0, 65535]. */
export function octaveValue(
  o: NoiseOctave,
  q: number,
  r: number,
  width: number,
  height: number,
): number {
  const ux = Math.floor((q * o.cellsX * FP) / width);
  const uy = Math.floor((r * o.cellsY * FP) / height);
  const x0 = (ux / FP) | 0;
  const y0 = (uy / FP) | 0;
  const sx = smooth(ux - x0 * FP);
  const sy = smooth(uy - y0 * FP);
  const x1 = x0 + 1 === o.cellsX ? 0 : x0 + 1; // periodic in x
  const v00 = hashLattice(x0, y0, o.salt) & 0xffff;
  const v10 = hashLattice(x1, y0, o.salt) & 0xffff;
  const v01 = hashLattice(x0, y0 + 1, o.salt) & 0xffff;
  const v11 = hashLattice(x1, y0 + 1, o.salt) & 0xffff;
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}

/**
 * Builds `octaves` fractal octaves starting at `baseCellsX` lattice cells
 * across the width, doubling frequency and halving weight per octave.
 * cellsY keeps lattice cells roughly square given the map aspect ratio
 * (integer round-half-up). One salt is drawn from `stream` per octave.
 */
export function makeOctaves(
  stream: Pcg32,
  width: number,
  height: number,
  baseCellsX: number,
  octaves: number,
): NoiseOctave[] {
  const specs: NoiseOctave[] = [];
  for (let i = 0; i < octaves; i++) {
    const cellsX = baseCellsX << i;
    const cellsY = Math.max(2, Math.floor((2 * cellsX * height + width) / (2 * width)));
    specs.push({ cellsX, cellsY, salt: stream.nextUint32(), weight: 1 << (octaves - 1 - i) });
  }
  return specs;
}

/** Weighted fractal sum of octaves at tile (q, r) → [0, 65535]. */
export function fractalValue(
  specs: readonly NoiseOctave[],
  q: number,
  r: number,
  width: number,
  height: number,
): number {
  let sum = 0;
  let weights = 0;
  for (const o of specs) {
    sum += octaveValue(o, q, r, width, height) * o.weight;
    weights += o.weight;
  }
  return Math.floor(sum / weights);
}
