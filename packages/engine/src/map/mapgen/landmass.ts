/**
 * Mapgen stage 1 — landmass. Fractal value noise blended with a lower-
 * frequency continent field, pole penalties for the polar ocean caps, and a
 * quantile threshold so the land fraction hits LAND_FRACTION_PER_1000
 * exactly (no seed produces an all-ocean or all-land world).
 *
 * Stream: 'mapgen:landmass'. Draws: 2 (noise seeds).
 */

import type { Pcg32 } from '../../rng/pcg32';
import { fbmNoise } from './noise';

/** Target land share, in tiles per 1000. */
export const LAND_FRACTION_PER_1000 = 340;

/** Rows within this distance of a pole are pushed toward ocean. */
const POLE_BAND = 4;

/** Returns a 0/1 land mask. Rows 0 and height−1 are always water (pole caps). */
export function generateLandmass(width: number, height: number, stream: Pcg32): Uint8Array {
  const detail = { seed: stream.nextUint32(), octaves: 4, cellBits: 4, periodX: width };
  const continents = { seed: stream.nextUint32(), octaves: 2, cellBits: 5, periodX: width };
  const tiles = width * height;
  const score = new Int32Array(tiles);
  for (let row = 0; row < height; row++) {
    const poleDist = Math.min(row, height - 1 - row);
    const polePenalty = poleDist < POLE_BAND ? (POLE_BAND - poleDist) * 11000 : 0;
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      // 5/8 continents + 3/8 detail: big connected masses with rough coasts.
      score[i] =
        Math.floor((fbmNoise(continents, col, row) * 5 + fbmNoise(detail, col, row) * 3) / 8) -
        polePenalty;
    }
  }
  // Quantile threshold: the (1 − landFraction) percentile of all scores.
  const sorted = Int32Array.from(score).sort();
  const cut = Math.min(tiles - 1, Math.floor((tiles * (1000 - LAND_FRACTION_PER_1000)) / 1000));
  const threshold = sorted[cut] as number;
  const land = new Uint8Array(tiles);
  for (let i = 0; i < tiles; i++) {
    const row = (i - (i % width)) / width;
    if (row === 0 || row === height - 1) {
      continue; // pole caps stay ocean
    }
    land[i] = (score[i] as number) >= threshold ? 1 : 0;
  }
  return land;
}
