/**
 * Mapgen stage 3 — climate bands (latitude × moisture, doc 02 §2.1).
 * Temperature falls with latitude and with elevation (cold peaks); moisture
 * is fBm noise plus a coastal bonus and a simple westerly rain shadow
 * (mountains up-wind ⇒ drier). Both fields are bytes; the biome stage
 * quantizes them into bands.
 *
 * Stream: 'mapgen:climate'. Draws: 2 (noise seeds).
 */

import type { Pcg32 } from '../../rng/pcg32';
import { neighborTile } from '../hex';
import { MOUNTAIN_ELEVATION } from '../terrain';
import { fbmNoise } from './noise';

export interface ClimateField {
  /** 0 (polar) .. 255 (equatorial heat), per tile. */
  readonly temperature: Uint8Array;
  /** 0 (arid) .. 255 (soaked), per tile; water tiles are 255. */
  readonly moisture: Uint8Array;
}

/** Direction index of "west" — the up-wind scan for the rain shadow. */
const DIR_W = 3;

export function generateClimate(
  width: number,
  height: number,
  land: Uint8Array,
  elevation: Uint8Array,
  stream: Pcg32,
): ClimateField {
  const tempJitter = { seed: stream.nextUint32(), octaves: 2, cellBits: 4, periodX: width };
  const moistField = { seed: stream.nextUint32(), octaves: 3, cellBits: 4, periodX: width };
  const tiles = width * height;
  const temperature = new Uint8Array(tiles);
  const moisture = new Uint8Array(tiles);
  for (let row = 0; row < height; row++) {
    // Latitude in 16-bit fixed point: 0 at the equator, 65536 at a pole.
    const lat = Math.floor((Math.abs(2 * row - (height - 1)) * 65536) / (height - 1));
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const elev = elevation[i] as number;
      // Temperature: latitude band − altitude chill ± local jitter.
      let t = 250 - Math.floor((lat * 225) / 65536);
      t -= Math.floor((Math.max(0, elev - 120) * 50) / 135);
      t += Math.floor((fbmNoise(tempJitter, col, row) * 24) / 65536) - 12;
      temperature[i] = Math.max(0, Math.min(255, t));
      if ((land[i] as number) === 0) {
        moisture[i] = 255;
        continue;
      }
      // fBm concentrates around its midpoint; stretch contrast ×2 so the dry
      // and wet moisture bands are actually populated on every map.
      const stretched = Math.max(
        0,
        Math.min(65535, (fbmNoise(moistField, col, row) - 32768) * 2 + 32768),
      );
      let m = 15 + Math.floor((stretched * 215) / 65536);
      // Coastal bonus: any adjacent water tile.
      for (let d = 0; d < 6; d++) {
        const n = neighborTile(i, d, width, height);
        if (n !== -1 && (land[n] as number) === 0) {
          m += 30;
          break;
        }
      }
      // Rain shadow: a mountain within 3 tiles up-wind (west) dries the tile.
      let scan = i;
      for (let step = 0; step < 3; step++) {
        scan = neighborTile(scan, DIR_W, width, height);
        if (scan === -1) {
          break;
        }
        if ((elevation[scan] as number) >= MOUNTAIN_ELEVATION) {
          m -= 45;
          break;
        }
      }
      moisture[i] = Math.max(0, Math.min(255, m));
    }
  }
  return { temperature, moisture };
}
