/**
 * Stage 3 — climate bands: temperature = latitude × elevation lapse (+ small
 * noise jitter so band edges aren't ruler-straight); moisture = fractal
 * noise + a nearness-to-water bonus. Both 0..255, feeding the biome lookup.
 * (Rain-shadow from prevailing winds is a later refinement — doc 02 §2.1.)
 */

import { ELEVATION_LAND_MIN } from '../terrain';
import { fractalValue, makeOctaves } from './noise';
import type { MapgenStage } from './types';

export const climateStage: MapgenStage = {
  name: 'climate',
  run(ctx, stream) {
    const { width, height, map, temperature, moisture, distToWater } = ctx;
    const jitterOctaves = makeOctaves(stream, width, height, 10, 2);
    const moistureOctaves = makeOctaves(stream, width, height, 7, 3);

    for (let r = 0; r < height; r++) {
      // 255 at the equator, 0 at the poles, falling off QUADRATICALLY with
      // latitude (like insolation — a linear ramp makes half the world
      // subpolar). lat = |2r - (h-1)| spans 0..(h-1) in half-row units.
      const lat = Math.abs(2 * r - (height - 1));
      const latBase = 255 - Math.floor((255 * lat * lat) / ((height - 1) * (height - 1)));
      for (let q = 0; q < width; q++) {
        const index = r * width + q;
        // ±12 jitter around the latitude band.
        const jitter = Math.floor((fractalValue(jitterOctaves, q, r, width, height) * 24) / 65535);
        // Elevation lapse: high ground is colder (only meaningful on land).
        const aboveSea = Math.max(0, (map.elevation[index] as number) - ELEVATION_LAND_MIN);
        const lapse = Math.floor((aboveSea * 2) / 5);
        temperature[index] = Math.max(0, Math.min(255, latBase - 12 + jitter - lapse));

        const wet = Math.floor((fractalValue(moistureOctaves, q, r, width, height) * 220) / 65535);
        // Coastal air is wetter: +36 at the shore fading out by 6 hexes inland.
        const coastal = Math.max(0, 36 - 6 * Math.min(6, distToWater[index] as number));
        moisture[index] = Math.min(255, wet + coastal);
      }
    }
  },
};
