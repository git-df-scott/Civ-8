/**
 * Mapgen stage 7 — quota-based resources. For each spec (fixed order,
 * terrain.ts RESOURCE_SPECS): collect eligible tiles in ascending order,
 * compute the per-map quota from the map area, and pick quota tiles with a
 * partial Fisher–Yates over the candidate list. Deterministic given the
 * stage stream; a spec with no eligible tiles simply places nothing (the
 * validation stage reports final counts as diagnostics).
 *
 * Stream: 'mapgen:resources'. Draws: `quota` per spec.
 */

import type { Pcg32 } from '../../rng/pcg32';
import { reliefOf, RESOURCE_SPECS } from '../terrain';

export function placeResources(
  width: number,
  height: number,
  terrain: Uint8Array,
  elevation: Uint8Array,
  feature: Uint8Array,
  stream: Pcg32,
): Uint8Array {
  const tiles = width * height;
  const resource = new Uint8Array(tiles);
  for (const spec of RESOURCE_SPECS) {
    const candidates: number[] = [];
    for (let i = 0; i < tiles; i++) {
      if (resource[i] !== 0) {
        continue;
      }
      if (!spec.terrains.includes(terrain[i] as number)) {
        continue;
      }
      if (!spec.reliefs.includes(reliefOf(elevation[i] as number))) {
        continue;
      }
      if (spec.requiredFeature !== undefined && feature[i] !== spec.requiredFeature) {
        continue;
      }
      candidates.push(i);
    }
    if (candidates.length === 0) {
      continue;
    }
    const quota = Math.min(
      candidates.length,
      Math.max(2, Math.floor((tiles * spec.per10kTiles) / 10000)),
    );
    // Partial Fisher–Yates: the first `quota` slots become the placements.
    for (let k = 0; k < quota; k++) {
      const j = k + stream.nextBounded(candidates.length - k);
      const picked = candidates[j] as number;
      candidates[j] = candidates[k] as number;
      candidates[k] = picked;
      resource[picked] = spec.id;
    }
  }
  return resource;
}
