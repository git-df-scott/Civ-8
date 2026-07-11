/**
 * Mapgen stage 2 — elevation and ridges. A raw score field is built from a
 * broad fBm base plus a strongly weighted "ridged" component (the fold of a
 * second noise field around its midline), which forms connected mountain
 * chains rather than salt-and-pepper peaks. The raw scores are then
 * quantile-calibrated into the elevation byte so every seed gets the same
 * relief mix: the top MOUNTAIN_SHARE of land is mountains (≥ 212), the next
 * HILLS_SHARE is hills (168..211), the rest is flat (1..167). Water stays
 * elevation 0; relief classes derive from the byte via terrain.ts reliefOf().
 *
 * Stream: 'mapgen:elevation'. Draws: 2 (noise seeds).
 */

import type { Pcg32 } from '../../rng/pcg32';
import { HILLS_ELEVATION, MOUNTAIN_ELEVATION } from '../terrain';
import { fbmNoise } from './noise';

/** Ridge activation point: the fold value above which the bonus kicks in. */
const RIDGE_FLOOR = 52000;

/** Land share of mountains / mountains+hills, per 1000 land tiles. */
const MOUNTAIN_SHARE_PER_1000 = 35;
const ROUGH_SHARE_PER_1000 = 180; // mountains + hills

export function generateElevation(
  width: number,
  height: number,
  land: Uint8Array,
  stream: Pcg32,
): Uint8Array {
  const base = { seed: stream.nextUint32(), octaves: 4, cellBits: 4, periodX: width };
  const ridge = { seed: stream.nextUint32(), octaves: 3, cellBits: 5, periodX: width };
  const tiles = width * height;

  // Raw scores: base rolling terrain + a ×4-weighted ridge crest, so the top
  // quantiles concentrate along connected ridge lines.
  const score = new Int32Array(tiles);
  const landScores: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      if ((land[i] as number) === 0) {
        continue;
      }
      let s = fbmNoise(base, col, row);
      const fold = 65536 - Math.abs(2 * fbmNoise(ridge, col, row) - 65536);
      if (fold > RIDGE_FLOOR) {
        s += (fold - RIDGE_FLOOR) * 4;
      }
      score[i] = s;
      landScores.push(s);
    }
  }
  const elevation = new Uint8Array(tiles);
  if (landScores.length === 0) {
    return elevation; // all-water map (never survives validation, but total)
  }

  // Quantile calibration: fixed relief shares for every seed.
  landScores.sort((a, b) => a - b);
  const at = (per1000FromTop: number): number =>
    landScores[
      Math.min(
        landScores.length - 1,
        Math.floor((landScores.length * (1000 - per1000FromTop)) / 1000),
      )
    ] as number;
  const mountainCut = at(MOUNTAIN_SHARE_PER_1000);
  const hillsCut = at(ROUGH_SHARE_PER_1000);
  const min = landScores[0] as number;
  const max = landScores[landScores.length - 1] as number;

  for (let i = 0; i < tiles; i++) {
    if ((land[i] as number) === 0) {
      continue;
    }
    const s = score[i] as number;
    let e: number;
    if (s >= mountainCut) {
      e = MOUNTAIN_ELEVATION + Math.floor(((s - mountainCut) * 43) / (max - mountainCut + 1));
    } else if (s >= hillsCut) {
      e =
        HILLS_ELEVATION +
        Math.floor(
          ((s - hillsCut) * (MOUNTAIN_ELEVATION - HILLS_ELEVATION)) / (mountainCut - hillsCut + 1),
        );
    } else {
      e = 1 + Math.floor(((s - min) * (HILLS_ELEVATION - 1)) / (hillsCut - min + 1));
    }
    elevation[i] = Math.max(1, Math.min(255, e));
  }
  return elevation;
}
