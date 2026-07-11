/**
 * Stage 2 — elevation & ridges.
 *
 * Raw relief potential = coast-distance term (broad downhill gradient to the
 * sea — what lets stage 5's rivers reach water) + continent-interior term +
 * a squared ridged-noise term that concentrates mountain chains. The raw
 * field is then remapped through its own per-map histogram into the fixed
 * elevation bands (terrain.ts): top 6% of land → mountains (≥210), next 15%
 * → hills (≥170), rest → flat [40, 170). The remap is monotonic, so
 * downhill ordering is preserved, and histogram targeting keeps relief
 * shares plausible on every size and seed (a fixed threshold starves small
 * maps of mountains — their continents never get far enough from the sea).
 * Water tiles stay at elevation 0. Also computes distToWater (integer BFS)
 * for later stages.
 */

import { neighborIndex } from '../hex';
import type { TileIndex } from '../../ids';
import { ELEVATION_HILLS_MIN, ELEVATION_LAND_MIN, ELEVATION_MOUNTAIN_MIN } from '../terrain';
import { fractalValue, makeOctaves } from './noise';
import type { MapgenContext, MapgenStage } from './types';

/** Share of land that becomes mountains / hills, in permille. */
const MOUNTAIN_TARGET_PERMILLE = 60;
const HILLS_TARGET_PERMILLE = 150;

/** Multi-source BFS from every water tile; hex distance capped at 255. */
export function computeDistToWater(ctx: MapgenContext): void {
  const { width, height, landMask, distToWater } = ctx;
  const tiles = width * height;
  distToWater.fill(255);
  // Ring buffer of tile indices; every tile enters the queue at most once.
  const queue = new Uint32Array(tiles);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < tiles; i++) {
    if (landMask[i] === 0) {
      distToWater[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const index = queue[head++] as number;
    const next = (distToWater[index] as number) + 1;
    if (next > 255) {
      continue;
    }
    for (let d = 0; d < 6; d++) {
      const n = neighborIndex(index as TileIndex, d, width, height);
      if (n >= 0 && next < (distToWater[n] as number)) {
        distToWater[n] = next;
        queue[tail++] = n;
      }
    }
  }
}

/** Raw relief potential per land tile: 0..214. */
function rawRelief(ctx: MapgenContext, ridge: number, index: number): number {
  // Coast-distance term: +7 per hex inland, saturating at 12 hexes.
  const coastTerm = 7 * Math.min(12, ctx.distToWater[index] as number);
  // Continent-interior term from the landmass field (reuse, 0..40).
  const interiorTerm = Math.floor(((ctx.heightField[index] as number) * 40) / 65536);
  // Ridged noise 0..65535 (peaks at the field's midline), squared to
  // sharpen chains, scaled to 0..90.
  const ridge2 = Math.floor((ridge * ridge) / 65535);
  return coastTerm + interiorTerm + Math.floor((ridge2 * 90) / 65535);
}

export const elevationStage: MapgenStage = {
  name: 'elevation',
  run(ctx, stream) {
    const { width, height, map, landMask } = ctx;
    computeDistToWater(ctx);
    const ridgeOctaves = makeOctaves(stream, width, height, 6, 4);
    const tiles = width * height;

    // 1. Raw relief potential for land tiles (water stays 0).
    const raw = new Int16Array(tiles).fill(-1);
    let landCount = 0;
    const histogram = new Uint32Array(256);
    for (let r = 0; r < height; r++) {
      for (let q = 0; q < width; q++) {
        const index = r * width + q;
        if (landMask[index] === 0) {
          map.elevation[index] = 0;
          continue;
        }
        const n = fractalValue(ridgeOctaves, q, r, width, height);
        const ridge = 65535 - Math.abs(2 * n - 65535);
        const value = rawRelief(ctx, ridge, index);
        raw[index] = value;
        histogram[value] = (histogram[value] as number) + 1;
        landCount += 1;
      }
    }
    if (landCount === 0) {
      return; // all-water world; validation will reject it with diagnostics
    }

    // 2. Histogram cuts: top 6% of land → mountains, next 15% → hills.
    const mountainTarget = Math.floor((landCount * MOUNTAIN_TARGET_PERMILLE) / 1000);
    const reliefTarget = Math.floor(
      (landCount * (MOUNTAIN_TARGET_PERMILLE + HILLS_TARGET_PERMILLE)) / 1000,
    );
    let above = 0;
    let mountainCut = 256;
    let hillsCut = 256;
    for (let v = 255; v >= 0; v--) {
      above += histogram[v] as number;
      if (mountainCut === 256 && above > mountainTarget) {
        mountainCut = v + 1;
      }
      if (above > reliefTarget) {
        hillsCut = v + 1;
        break;
      }
    }
    if (hillsCut > mountainCut) {
      hillsCut = mountainCut;
    }

    // 3. Monotonic piecewise-linear remap into the fixed elevation bands.
    for (let index = 0; index < tiles; index++) {
      const value = raw[index] as number;
      if (value < 0) {
        continue; // water
      }
      let elevation: number;
      if (value >= mountainCut) {
        const span = Math.max(1, 215 - mountainCut);
        elevation =
          ELEVATION_MOUNTAIN_MIN +
          Math.floor(((255 - ELEVATION_MOUNTAIN_MIN) * (value - mountainCut)) / span);
      } else if (value >= hillsCut) {
        const span = Math.max(1, mountainCut - hillsCut);
        elevation =
          ELEVATION_HILLS_MIN +
          Math.floor(
            ((ELEVATION_MOUNTAIN_MIN - 1 - ELEVATION_HILLS_MIN) * (value - hillsCut)) / span,
          );
      } else {
        const span = Math.max(1, hillsCut);
        elevation =
          ELEVATION_LAND_MIN +
          Math.floor(((ELEVATION_HILLS_MIN - 1 - ELEVATION_LAND_MIN) * value) / span);
      }
      map.elevation[index] = Math.min(255, elevation);
    }
  },
};
