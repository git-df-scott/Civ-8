/**
 * Stage 7 — quota-based resources: each resource type gets a per-map quota
 * scaled by tile count, placed on tiles drawn (swap-remove, one substream
 * draw per placement) from its deterministic eligible list.
 *
 * CONTENT-PACK SEAM: this table becomes packages/content resource data in
 * M4+ (doc 04 §2); the placement algorithm stays.
 */

import { RELIEF, RESOURCE, TERRAIN, FEATURE, reliefOf } from '../terrain';
import type { MapgenContext, MapgenStage } from './types';

interface ResourceRule {
  readonly id: number;
  /** Placements per 1000 map tiles (min 1 when any tile is eligible). */
  readonly per1000: number;
  eligible(ctx: MapgenContext, index: number): boolean;
}

function landWith(
  ctx: MapgenContext,
  index: number,
  terrains: readonly number[],
  reliefs: readonly number[],
  allowFeature: boolean,
): boolean {
  if (ctx.landMask[index] === 0) {
    return false;
  }
  if (!allowFeature && ctx.map.feature[index] !== FEATURE.None) {
    return false;
  }
  return (
    terrains.includes(ctx.map.terrain[index] as number) &&
    reliefs.includes(reliefOf(ctx.map.elevation[index] as number))
  );
}

/** The M2 starter set — enough spread to exercise every terrain family. */
const RESOURCE_RULES: readonly ResourceRule[] = [
  {
    id: RESOURCE.Wheat,
    per1000: 11,
    eligible: (ctx, i) =>
      landWith(ctx, i, [TERRAIN.Grassland, TERRAIN.Plains], [RELIEF.Flat], false),
  },
  {
    id: RESOURCE.Cattle,
    per1000: 9,
    eligible: (ctx, i) => landWith(ctx, i, [TERRAIN.Grassland], [RELIEF.Flat], false),
  },
  {
    id: RESOURCE.Horses,
    per1000: 8,
    eligible: (ctx, i) =>
      landWith(ctx, i, [TERRAIN.Grassland, TERRAIN.Plains], [RELIEF.Flat], false),
  },
  {
    id: RESOURCE.Iron,
    per1000: 8,
    eligible: (ctx, i) =>
      landWith(
        ctx,
        i,
        [TERRAIN.Grassland, TERRAIN.Plains, TERRAIN.Desert, TERRAIN.Tundra],
        [RELIEF.Hills],
        true,
      ),
  },
  {
    id: RESOURCE.Stone,
    per1000: 8,
    eligible: (ctx, i) =>
      landWith(
        ctx,
        i,
        [TERRAIN.Plains, TERRAIN.Desert, TERRAIN.Tundra],
        [RELIEF.Flat, RELIEF.Hills],
        false,
      ),
  },
  {
    id: RESOURCE.Gold,
    per1000: 5,
    eligible: (ctx, i) =>
      landWith(ctx, i, [TERRAIN.Desert], [RELIEF.Flat, RELIEF.Hills], false) ||
      landWith(ctx, i, [TERRAIN.Grassland, TERRAIN.Plains], [RELIEF.Hills], false),
  },
  {
    id: RESOURCE.Furs,
    per1000: 6,
    eligible: (ctx, i) =>
      landWith(ctx, i, [TERRAIN.Tundra, TERRAIN.Snow], [RELIEF.Flat, RELIEF.Hills], true) ||
      (ctx.map.feature[i] === FEATURE.Forest &&
        reliefOf(ctx.map.elevation[i] as number) !== RELIEF.Mountain),
  },
  {
    id: RESOURCE.Fish,
    per1000: 12,
    eligible: (ctx, i) => ctx.map.terrain[i] === TERRAIN.Coast,
  },
];

export const resourcesStage: MapgenStage = {
  name: 'resources',
  run(ctx, stream) {
    const tiles = ctx.width * ctx.height;
    for (const rule of RESOURCE_RULES) {
      // Eligible tiles in ascending index order (deterministic).
      const eligible: number[] = [];
      for (let index = 0; index < tiles; index++) {
        if (ctx.map.resource[index] === RESOURCE.None && rule.eligible(ctx, index)) {
          eligible.push(index);
        }
      }
      if (eligible.length === 0) {
        continue;
      }
      const quota = Math.min(
        eligible.length,
        Math.max(1, Math.floor((tiles * rule.per1000) / 1000)),
      );
      for (let placed = 0; placed < quota; placed++) {
        const pick = stream.nextBounded(eligible.length);
        ctx.map.resource[eligible[pick] as number] = rule.id;
        eligible[pick] = eligible[eligible.length - 1] as number;
        eligible.pop();
      }
    }
  },
};

/** Exposed for the validation stage: is this tile legal for its resource? */
export function resourcePlacementIsLegal(ctx: MapgenContext, index: number): boolean {
  const resource = ctx.map.resource[index] as number;
  if (resource === RESOURCE.None) {
    return true;
  }
  const rule = RESOURCE_RULES.find((r) => r.id === resource);
  return rule !== undefined && rule.eligible(ctx, index);
}
