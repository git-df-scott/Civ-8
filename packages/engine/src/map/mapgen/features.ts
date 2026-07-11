/**
 * Mapgen stage 6 — features (forest / jungle / marsh). Candidacy is a pure
 * function of terrain, climate, and relief; the stage's RNG stream is drawn
 * once per candidate tile (in ascending tile order), so placement is fully
 * deterministic and independent of every other stage's stream.
 *
 * Stream: 'mapgen:features'. Draws: one per candidate tile.
 */

import type { Pcg32 } from '../../rng/pcg32';
import { FEATURE, RELIEF, reliefOf, TERRAIN } from '../terrain';
import type { ClimateField } from './climate';

/** Jungle: hot and wet lowlands. */
const JUNGLE_TEMP = 185;
const JUNGLE_MOISTURE = 165;
const JUNGLE_CHANCE = 55;

/** Forest: temperate, reasonably moist. */
const FOREST_TEMP_MIN = 58;
const FOREST_MOISTURE = 100;
const FOREST_CHANCE = 38;

/** Marsh: soaked flat grassland lowlands. */
const MARSH_MOISTURE = 170;
const MARSH_MAX_ELEVATION = 90;
const MARSH_CHANCE = 25;

export function placeFeatures(
  width: number,
  height: number,
  terrain: Uint8Array,
  elevation: Uint8Array,
  climate: ClimateField,
  stream: Pcg32,
): Uint8Array {
  const tiles = width * height;
  const feature = new Uint8Array(tiles);
  for (let i = 0; i < tiles; i++) {
    const terr = terrain[i] as number;
    const elev = elevation[i] as number;
    const relief = reliefOf(elev);
    if (elev === 0 || relief === RELIEF.MOUNTAIN) {
      continue; // no features on water or mountain peaks
    }
    const temp = climate.temperature[i] as number;
    const moist = climate.moisture[i] as number;
    const greenFlat = terr === TERRAIN.GRASSLAND || terr === TERRAIN.PLAINS;
    if (greenFlat && temp >= JUNGLE_TEMP && moist >= JUNGLE_MOISTURE) {
      if (stream.nextBounded(100) < JUNGLE_CHANCE) {
        feature[i] = FEATURE.JUNGLE;
      }
    } else if (
      (greenFlat || terr === TERRAIN.TUNDRA) &&
      temp >= FOREST_TEMP_MIN &&
      temp < JUNGLE_TEMP &&
      moist >= FOREST_MOISTURE
    ) {
      if (stream.nextBounded(100) < FOREST_CHANCE) {
        feature[i] = FEATURE.FOREST;
      }
    } else if (
      terr === TERRAIN.GRASSLAND &&
      relief === RELIEF.FLAT &&
      moist >= MARSH_MOISTURE &&
      elev < MARSH_MAX_ELEVATION
    ) {
      if (stream.nextBounded(100) < MARSH_CHANCE) {
        feature[i] = FEATURE.MARSH;
      }
    }
  }
  return feature;
}
