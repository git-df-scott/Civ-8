/**
 * Integer-seeded, integer-output value noise with fBm — the engine's own
 * ~80-line implementation (doc 04 §4: no float-seeded npm noise libs).
 *
 * Everything is exact integer math in doubles (every intermediate < 2^53):
 * lattice values are 16-bit, fractions are 16-bit fixed point, and the
 * smoothstep fade is computed as t²(3·2¹⁶ − 2t) / 2³². The x axis is
 * periodic with period `periodX` tiles (the cylinder wrap): lattice columns
 * are hashed modulo the lattice period, and the seam cell (when the period
 * is not a multiple of the cell size) interpolates over its true, shorter
 * width, so the value field is continuous across the wrap.
 */

export interface NoiseSpec {
  /** 32-bit seed (draw it from the stage's RNG substream). */
  readonly seed: number;
  /** Octave count (each octave halves the cell size, min cell 2 tiles). */
  readonly octaves: number;
  /** Octave-0 lattice cell size in tiles, as a power of two (e.g. 5 ⇒ 32). */
  readonly cellBits: number;
  /** Horizontal period in tiles (the map width). */
  readonly periodX: number;
}

/** 32-bit lattice hash: mix (x, y, seed) into a uniform uint32. */
function latticeHash(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2f) ^ Math.imul(y, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Lattice value in [0, 2^16). */
function latticeValue(x: number, y: number, seed: number): number {
  return latticeHash(x, y, seed) & 0xffff;
}

/** Smoothstep fade of a 16-bit fraction: t²(3·2¹⁶ − 2t) / 2³², in [0, 2^16]. */
function fade(t: number): number {
  return Math.floor((t * t * (3 * 65536 - 2 * t)) / 0x100000000);
}

/** Integer lerp: a + (b − a)·t / 2¹⁶ (t is a 16-bit fixed-point fraction). */
function lerp(a: number, b: number, t: number): number {
  return a + Math.floor(((b - a) * t) / 65536);
}

/** One octave of periodic-in-x value noise at integer tile coords, in [0, 2^16). */
function octaveValue(x: number, y: number, cell: number, periodX: number, seed: number): number {
  // Lattice columns 0..cols-1; the last cell spans [colStart, periodX) and may
  // be narrower than `cell` — interpolation uses its true width, so the field
  // stays continuous across the wrap seam.
  const cols = Math.max(1, Math.ceil(periodX / cell));
  const x0 = Math.floor(x / cell);
  const y0 = Math.floor(y / cell);
  const cellW = x0 === cols - 1 ? periodX - x0 * cell : cell;
  const fx = fade(Math.floor(((x - x0 * cell) * 65536) / cellW));
  const fy = fade(Math.floor(((y - y0 * cell) * 65536) / cell));
  const hx0 = x0 % cols;
  const hx1 = (x0 + 1) % cols;
  const v00 = latticeValue(hx0, y0, seed);
  const v10 = latticeValue(hx1, y0, seed);
  const v01 = latticeValue(hx0, y0 + 1, seed);
  const v11 = latticeValue(hx1, y0 + 1, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/**
 * Fractal (fBm) value noise at integer tile coordinates, in [0, 2^16).
 * Octave o uses cell size 2^(cellBits−o) (min 2) and a distinct derived seed;
 * amplitudes halve per octave and are normalized so the total is 2¹⁶.
 */
export function fbmNoise(spec: NoiseSpec, x: number, y: number): number {
  let sum = 0;
  let ampLeft = 65536;
  for (let o = 0; o < spec.octaves; o++) {
    const last = o === spec.octaves - 1;
    const amp = last ? ampLeft : ampLeft >> 1;
    ampLeft -= amp;
    const cell = Math.max(2, 1 << Math.max(1, spec.cellBits - o));
    const seed = (spec.seed + Math.imul(o + 1, 0x9e3779b9)) >>> 0;
    sum += octaveValue(x, y, cell, spec.periodX, seed) * amp;
  }
  return Math.floor(sum / 65536);
}
