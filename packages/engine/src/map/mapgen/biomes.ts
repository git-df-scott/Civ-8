/**
 * Stage 4 — biomes: a pure lookup of temperature band × moisture band per
 * land tile (no draws — the stage's substream is reserved). Water becomes
 * Coast where it touches land, Ocean elsewhere.
 *
 * CONTENT-PACK SEAM: the band edges and table become terrain content in M4+.
 */

import { neighborIndex } from '../hex';
import type { TileIndex } from '../../ids';
import { TERRAIN } from '../terrain';
import type { MapgenStage } from './types';

/** Temperature band upper bounds (exclusive): frigid, cold, cool, temperate, hot. */
const TEMP_BANDS = [40, 85, 150, 205, 256] as const;
/** Moisture band upper bounds (exclusive): arid, semi-arid, moist, wet. */
const MOIST_BANDS = [70, 120, 180, 256] as const;

/** biome = BIOME_TABLE[tempBand][moistBand]. */
const BIOME_TABLE: ReadonlyArray<readonly [number, number, number, number]> = [
  [TERRAIN.Snow, TERRAIN.Snow, TERRAIN.Snow, TERRAIN.Snow], // frigid
  [TERRAIN.Tundra, TERRAIN.Tundra, TERRAIN.Tundra, TERRAIN.Tundra], // cold
  [TERRAIN.Plains, TERRAIN.Plains, TERRAIN.Grassland, TERRAIN.Grassland], // cool
  [TERRAIN.Plains, TERRAIN.Plains, TERRAIN.Grassland, TERRAIN.Grassland], // temperate
  [TERRAIN.Desert, TERRAIN.Desert, TERRAIN.Plains, TERRAIN.Grassland], // hot
];

function band(value: number, bounds: readonly number[]): number {
  for (let i = 0; i < bounds.length; i++) {
    if (value < (bounds[i] as number)) {
      return i;
    }
  }
  return bounds.length - 1;
}

export const biomesStage: MapgenStage = {
  name: 'biomes',
  run(ctx) {
    const { width, height, map, landMask, temperature, moisture } = ctx;
    for (let index = 0; index < map.terrain.length; index++) {
      if (landMask[index] === 1) {
        const t = band(temperature[index] as number, TEMP_BANDS);
        const m = band(moisture[index] as number, MOIST_BANDS);
        map.terrain[index] = (BIOME_TABLE[t] as readonly number[])[m] as number;
        continue;
      }
      // Water: Coast when touching land, Ocean otherwise.
      let touchesLand = false;
      for (let d = 0; d < 6 && !touchesLand; d++) {
        const n = neighborIndex(index as TileIndex, d, width, height);
        touchesLand = n >= 0 && landMask[n] === 1;
      }
      map.terrain[index] = touchesLand ? TERRAIN.Coast : TERRAIN.Ocean;
    }
  },
};
