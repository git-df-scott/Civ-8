/**
 * Stage 6 — features: forest / jungle / marsh from climate + one substream
 * roll per candidate tile (ascending tile order — deterministic).
 *
 * CONTENT-PACK SEAM: thresholds and chances become terrain-feature content
 * in M4+.
 */

import { hasAnyRiverEdge } from '../grid';
import { ELEVATION_MOUNTAIN_MIN, FEATURE } from '../terrain';
import type { MapgenStage } from './types';

export const featuresStage: MapgenStage = {
  name: 'features',
  run(ctx, stream) {
    const { map, landMask, temperature, moisture } = ctx;
    for (let index = 0; index < map.feature.length; index++) {
      if (landMask[index] === 0 || (map.elevation[index] as number) >= ELEVATION_MOUNTAIN_MIN) {
        continue; // no features on water or mountain peaks
      }
      const roll = stream.nextBounded(1000);
      const t = temperature[index] as number;
      // River banks are effectively wetter.
      const m = (moisture[index] as number) + (hasAnyRiverEdge(map, index) ? 30 : 0);
      // Marsh first: it needs the wettest lowlands, which jungle/forest
      // would otherwise always swallow (their roll ranges overlap).
      if (t >= 85 && m >= 170 && (map.elevation[index] as number) < 110 && roll < 180) {
        map.feature[index] = FEATURE.Marsh;
      } else if (t >= 205 && m >= 140 && roll < 700) {
        map.feature[index] = FEATURE.Jungle;
      } else if (t >= 60 && t < 205 && m >= 130 && roll < 550) {
        map.feature[index] = FEATURE.Forest;
      }
    }
  },
};
