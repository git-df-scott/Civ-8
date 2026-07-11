/**
 * Stage 1 — landmass: continents from fractal integer value noise.
 *
 * A low-frequency fractal field, attenuated toward the poles (pole caps stay
 * ocean), thresholded by histogram so every seed hits the target land
 * fraction almost exactly. Writes landMask + heightField; terrain gets a
 * provisional Ocean/Grassland split (biomes overwrites land, coast arrives
 * with biomes too).
 */

import { TERRAIN } from '../terrain';
import { fractalValue, makeOctaves } from './noise';
import type { MapgenStage } from './types';

/** Target land share of all tiles, in permille. */
export const LAND_TARGET_PERMILLE = 320;

/** Rows near each pole where land is pushed down (cap width scales with map). */
function poleBand(height: number): number {
  return Math.max(3, Math.floor(height / 10));
}

/** Local fixed-point scale for the pole falloff. */
const FPQ = 4096;

export const landmassStage: MapgenStage = {
  name: 'landmass',
  run(ctx, stream) {
    const { width, height, map, landMask, heightField } = ctx;
    const octaves = makeOctaves(stream, width, height, 4, 5);
    const band = poleBand(height);

    // 1. Raw field with pole attenuation.
    for (let r = 0; r < height; r++) {
      const distToPole = Math.min(r, height - 1 - r);
      // Full strength outside the band; linear falloff to 25% at the pole row.
      const poleScale =
        distToPole >= band ? FPQ : Math.floor(FPQ / 4 + (3 * FPQ * distToPole) / (4 * band));
      for (let q = 0; q < width; q++) {
        const index = r * width + q;
        const v = fractalValue(octaves, q, r, width, height);
        heightField[index] = Math.floor((v * poleScale) / FPQ);
      }
    }

    // 2. Histogram threshold: the smallest height H such that the share of
    // tiles above H is at most the target land fraction.
    const histogram = new Uint32Array(65536);
    for (let i = 0; i < heightField.length; i++) {
      const h = heightField[i] as number;
      histogram[h] = (histogram[h] as number) + 1;
    }
    const targetLand = Math.floor((heightField.length * LAND_TARGET_PERMILLE) / 1000);
    let above = 0;
    let threshold = 65535;
    for (let h = 65535; h >= 0; h--) {
      above += histogram[h] as number;
      if (above > targetLand) {
        threshold = h + 1;
        break;
      }
      threshold = h;
    }

    // 3. Provisional terrain + land mask.
    for (let i = 0; i < heightField.length; i++) {
      const land = (heightField[i] as number) >= threshold && threshold > 0;
      landMask[i] = land ? 1 : 0;
      map.terrain[i] = land ? TERRAIN.Grassland : TERRAIN.Ocean;
    }
  },
};
