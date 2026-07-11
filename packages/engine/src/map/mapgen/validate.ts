/**
 * Stage 8 — validation: asserts the generated world is structurally sound,
 * throwing MapgenValidationError with per-check diagnostics on any failure
 * (doc 04 §4 "validation asserts with stage diagnostics"). Draws nothing
 * from its substream — it must never change the map.
 */

import { neighborIndex } from '../hex';
import type { TileIndex } from '../../ids';
import {
  ELEVATION_LAND_MIN,
  ELEVATION_MOUNTAIN_MIN,
  FEATURE,
  TERRAIN,
  isWaterTerrain,
} from '../terrain';
import { riverEdgesAreMirrored, type MapState } from '../grid';
import { resourcePlacementIsLegal } from './resources';
import { vertexEdges, vertexTiles } from './rivers';
import { hasRiverEdge } from '../grid';
import { Pcg32 } from '../../rng/pcg32';
import type { MapgenContext, MapgenStage } from './types';
import { MapgenValidationError } from './types';

/** Permille bounds for land share of all tiles (target is 320). */
const LAND_MIN_PERMILLE = 220;
const LAND_MAX_PERMILLE = 450;
/** Permille bounds for mountain share of land tiles. */
const MOUNTAIN_MIN_PERMILLE = 2;
const MOUNTAIN_MAX_PERMILLE = 250;

export const validateStage: MapgenStage = {
  name: 'validate',
  run(ctx) {
    const { width, height, map, landMask } = ctx;
    const tiles = width * height;
    const problems: string[] = [];

    // -- Terrain composition ------------------------------------------------
    let land = 0;
    let mountains = 0;
    for (let i = 0; i < tiles; i++) {
      const terrain = map.terrain[i] as number;
      const isWater = isWaterTerrain(terrain);
      if (isWater !== (landMask[i] === 0)) {
        problems.push(`tile ${i}: terrain ${terrain} disagrees with landMask ${landMask[i]}`);
      }
      if (!isWater) {
        land += 1;
        if ((map.elevation[i] as number) >= ELEVATION_MOUNTAIN_MIN) {
          mountains += 1;
        }
        if ((map.elevation[i] as number) < ELEVATION_LAND_MIN) {
          problems.push(`tile ${i}: land elevation ${map.elevation[i]} below land minimum`);
        }
      } else if ((map.elevation[i] as number) >= ELEVATION_LAND_MIN) {
        problems.push(`tile ${i}: water elevation ${map.elevation[i]} at/above land minimum`);
      }
    }
    const landPermille = Math.floor((1000 * land) / tiles);
    if (landPermille < LAND_MIN_PERMILLE || landPermille > LAND_MAX_PERMILLE) {
      problems.push(
        `land fraction ${landPermille}‰ outside [${LAND_MIN_PERMILLE}, ${LAND_MAX_PERMILLE}]‰`,
      );
    }
    if (land > 0) {
      const mountainPermille = Math.floor((1000 * mountains) / land);
      if (mountainPermille < MOUNTAIN_MIN_PERMILLE || mountainPermille > MOUNTAIN_MAX_PERMILLE) {
        problems.push(
          `mountain share ${mountainPermille}‰ of land outside ` +
            `[${MOUNTAIN_MIN_PERMILLE}, ${MOUNTAIN_MAX_PERMILLE}]‰`,
        );
      }
    }

    // -- Coast/ocean adjacency ----------------------------------------------
    for (let i = 0; i < tiles; i++) {
      const terrain = map.terrain[i] as number;
      if (terrain !== TERRAIN.Ocean && terrain !== TERRAIN.Coast) {
        continue;
      }
      let touchesLand = false;
      for (let d = 0; d < 6 && !touchesLand; d++) {
        const n = neighborIndex(i as TileIndex, d, width, height);
        touchesLand = n >= 0 && landMask[n] === 1;
      }
      if (terrain === TERRAIN.Ocean && touchesLand) {
        problems.push(`tile ${i}: Ocean touches land (should be Coast)`);
      }
      if (terrain === TERRAIN.Coast && !touchesLand) {
        problems.push(`tile ${i}: Coast touches no land`);
      }
    }

    // -- Features -----------------------------------------------------------
    for (let i = 0; i < tiles; i++) {
      const feature = map.feature[i] as number;
      if (feature === FEATURE.None) {
        continue;
      }
      if (landMask[i] === 0) {
        problems.push(`tile ${i}: feature ${feature} on water`);
      } else if ((map.elevation[i] as number) >= ELEVATION_MOUNTAIN_MIN) {
        problems.push(`tile ${i}: feature ${feature} on a mountain`);
      }
    }

    // -- Resources ----------------------------------------------------------
    for (let i = 0; i < tiles; i++) {
      if (!resourcePlacementIsLegal(ctx, i)) {
        problems.push(`tile ${i}: resource ${map.resource[i]} on an ineligible tile`);
      }
    }

    // -- Rivers -------------------------------------------------------------
    if (!riverEdgesAreMirrored(map)) {
      problems.push('riverEdges bitmask is not mirrored across shared edges');
    }
    checkRiversReachWater(ctx, problems);

    if (problems.length > 0) {
      throw new MapgenValidationError(
        `mapgen validation failed with ${problems.length} problem(s)`,
        problems.slice(0, 25),
      );
    }
  },
};

/**
 * Re-runs mapgen's own semantic validation (this file's `validateStage`)
 * against an already-built map — e.g. one deserialized from a save — so
 * `Game.load` can never admit a map mapgen itself would have rejected
 * (doc 04 §3.4). This is the SAME check function mapgen runs at generation
 * time, not a hand-rolled parallel copy: elevation bounds, feature/resource
 * placement legality, coast/ocean adjacency, and river-network water
 * connectivity are all exercised for real.
 *
 * `landMask` is never serialized (it's an intermediate mapgen field, doc 04
 * §3.1), so it is rederived from terrain via `isWaterTerrain`. That makes
 * the stage's own terrain/landMask-agreement check trivially true by
 * construction, but every other check still validates real data. The other
 * intermediate fields (heightField, distToWater, temperature, moisture) are
 * unused by validateStage and are passed as empty placeholders.
 *
 * Throws MapgenValidationError with per-check diagnostics on any violation.
 * Draws nothing from RNG — validateStage never does — so the stream handed
 * in is a throwaway.
 */
export function validateMapSemantics(map: MapState, width: number, height: number): void {
  const tiles = width * height;
  const landMask = new Uint8Array(tiles);
  for (let i = 0; i < tiles; i++) {
    landMask[i] = isWaterTerrain(map.terrain[i] as number) ? 0 : 1;
  }
  const ctx: MapgenContext = {
    width,
    height,
    map,
    landMask,
    heightField: new Uint16Array(tiles),
    distToWater: new Uint8Array(tiles),
    temperature: new Uint8Array(tiles),
    moisture: new Uint8Array(tiles),
  };
  validateStage.run(ctx, Pcg32.stream(0, 'save-load-validate'));
}

/**
 * Every connected river network must touch water (sea, coast, or a lake) —
 * BFS over the vertex graph restricted to river edges.
 */
function checkRiversReachWater(ctx: MapgenContext, problems: string[]): void {
  const { width, height, map, landMask } = ctx;
  const vertexCount = 2 * width * height;
  const seen = new Uint8Array(vertexCount);
  const stack: number[] = [];
  for (let start = 0; start < vertexCount; start++) {
    if (seen[start] === 1) {
      continue;
    }
    const startEdges = vertexEdges(start, width, height).filter((e) =>
      hasRiverEdge(map, e.tile, e.dir),
    );
    if (startEdges.length === 0) {
      continue;
    }
    // BFS this river network.
    let reachesWater = false;
    let size = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const v = stack.pop() as number;
      size += 1;
      const touching = vertexTiles(v, width, height);
      if (
        touching !== null &&
        (landMask[touching[0]] === 0 || landMask[touching[1]] === 0 || landMask[touching[2]] === 0)
      ) {
        reachesWater = true;
      }
      for (const edge of vertexEdges(v, width, height)) {
        if (hasRiverEdge(map, edge.tile, edge.dir) && seen[edge.vertex] === 0) {
          seen[edge.vertex] = 1;
          stack.push(edge.vertex);
        }
      }
    }
    if (!reachesWater) {
      problems.push(
        `river network of ${size} vertices starting at vertex ${start} never reaches water`,
      );
    }
  }
}
