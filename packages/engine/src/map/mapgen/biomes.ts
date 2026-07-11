/**
 * Mapgen stage 4 — biome lookup. A pure table lookup (temperature band ×
 * moisture band ⇒ base terrain) plus the coast pass (ocean adjacent to land
 * becomes coast). No RNG: this stage is fully determined by its inputs.
 */

import { neighborTile } from '../hex';
import { TERRAIN } from '../terrain';
import type { ClimateField } from './climate';

/** Temperature band upper bounds (exclusive): polar / cold / temperate / hot. */
const TEMP_BANDS: readonly number[] = [58, 105, 180];

/** Moisture band upper bounds (exclusive): dry / normal / wet. */
const MOIST_BANDS: readonly number[] = [95, 165];

/** BIOME_TABLE[tempBand][moistBand] — the M2 biome lookup (content seam, M4+). */
const BIOME_TABLE: readonly (readonly number[])[] = [
  [TERRAIN.SNOW, TERRAIN.SNOW, TERRAIN.SNOW],
  [TERRAIN.TUNDRA, TERRAIN.TUNDRA, TERRAIN.TUNDRA],
  [TERRAIN.PLAINS, TERRAIN.GRASSLAND, TERRAIN.GRASSLAND],
  [TERRAIN.DESERT, TERRAIN.PLAINS, TERRAIN.GRASSLAND],
];

function band(value: number, bounds: readonly number[]): number {
  let b = 0;
  while (b < bounds.length && value >= (bounds[b] as number)) {
    b++;
  }
  return b;
}

export function assignBiomes(
  width: number,
  height: number,
  land: Uint8Array,
  climate: ClimateField,
): Uint8Array {
  const tiles = width * height;
  const terrain = new Uint8Array(tiles); // defaults to OCEAN
  for (let i = 0; i < tiles; i++) {
    if ((land[i] as number) === 1) {
      const t = band(climate.temperature[i] as number, TEMP_BANDS);
      const m = band(climate.moisture[i] as number, MOIST_BANDS);
      terrain[i] = (BIOME_TABLE[t] as readonly number[])[m] as number;
    }
  }
  // Coast pass: ocean with at least one land neighbor becomes coast.
  for (let i = 0; i < tiles; i++) {
    if (terrain[i] !== TERRAIN.OCEAN) {
      continue;
    }
    for (let d = 0; d < 6; d++) {
      const n = neighborTile(i, d, width, height);
      if (n !== -1 && (land[n] as number) === 1) {
        terrain[i] = TERRAIN.COAST;
        break;
      }
    }
  }
  return terrain;
}
