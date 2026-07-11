/**
 * Mapgen stage 8 — validation asserts with stage diagnostics. Runs after
 * every generation: computes a diagnostics summary (also useful for benches
 * and the preview tool) and asserts the structural invariants every later
 * system depends on. A violation throws MapgenValidationError naming the
 * broken invariant, the stage that owns it, and the full diagnostics.
 */

import { mapNeighbor, type MapState } from '../grid';
import { oppositeDirection } from '../hex';
import {
  FEATURE,
  FEATURE_COUNT,
  isWaterTerrain,
  RELIEF,
  reliefOf,
  RESOURCE,
  RESOURCE_COUNT,
  TERRAIN,
  TERRAIN_COUNT,
} from '../terrain';

export interface MapgenDiagnostics {
  readonly landTiles: number;
  readonly landPer1000: number;
  readonly mountainTiles: number;
  readonly hillTiles: number;
  readonly lakeTiles: number;
  readonly coastTiles: number;
  readonly riverEdgeCount: number;
  readonly featureCounts: readonly number[];
  readonly resourceCounts: readonly number[];
}

export class MapgenValidationError extends Error {
  readonly stage: string;
  readonly diagnostics: MapgenDiagnostics;

  constructor(stage: string, message: string, diagnostics: MapgenDiagnostics) {
    super(`mapgen validation failed [stage ${stage}]: ${message}\n${JSON.stringify(diagnostics)}`);
    this.name = 'MapgenValidationError';
    this.stage = stage;
    this.diagnostics = diagnostics;
  }
}

/** Land fraction sanity band, per 1000 tiles. */
const LAND_PER_1000_MIN = 250;
const LAND_PER_1000_MAX = 450;

export function computeDiagnostics(map: MapState): MapgenDiagnostics {
  const tiles = map.width * map.height;
  let landTiles = 0;
  let mountainTiles = 0;
  let hillTiles = 0;
  let lakeTiles = 0;
  let coastTiles = 0;
  let riverEdgeCount = 0;
  const featureCounts = new Array<number>(FEATURE_COUNT).fill(0);
  const resourceCounts = new Array<number>(RESOURCE_COUNT).fill(0);
  for (let i = 0; i < tiles; i++) {
    const terr = map.terrain[i] as number;
    if (!isWaterTerrain(terr)) {
      landTiles++;
      const relief = reliefOf(map.elevation[i] as number);
      if (relief === RELIEF.MOUNTAIN) {
        mountainTiles++;
      } else if (relief === RELIEF.HILLS) {
        hillTiles++;
      }
    }
    if (terr === TERRAIN.LAKE) {
      lakeTiles++;
    }
    if (terr === TERRAIN.COAST) {
      coastTiles++;
    }
    let mask = map.riverEdges[i] as number;
    while (mask !== 0) {
      riverEdgeCount += mask & 1;
      mask >>>= 1;
    }
    featureCounts[map.feature[i] as number] = (featureCounts[map.feature[i] as number] ?? 0) + 1;
    resourceCounts[map.resource[i] as number] =
      (resourceCounts[map.resource[i] as number] ?? 0) + 1;
  }
  return {
    landTiles,
    landPer1000: Math.floor((landTiles * 1000) / tiles),
    mountainTiles,
    hillTiles,
    lakeTiles,
    coastTiles,
    riverEdgeCount: riverEdgeCount / 2, // each river edge is recorded on both tiles
    featureCounts,
    resourceCounts,
  };
}

export function validateMap(map: MapState): MapgenDiagnostics {
  const diagnostics = computeDiagnostics(map);
  const tiles = map.width * map.height;
  const failed = (stage: string, message: string): never => {
    throw new MapgenValidationError(stage, message, diagnostics);
  };

  for (const [field, array] of [
    ['terrain', map.terrain],
    ['elevation', map.elevation],
    ['feature', map.feature],
    ['resource', map.resource],
    ['riverEdges', map.riverEdges],
  ] as const) {
    if (array.length !== tiles) {
      failed('grid', `${field} length ${array.length} != ${tiles}`);
    }
  }

  if (diagnostics.landPer1000 < LAND_PER_1000_MIN || diagnostics.landPer1000 > LAND_PER_1000_MAX) {
    failed('landmass', `land fraction ${diagnostics.landPer1000}/1000 outside sanity band`);
  }

  for (let i = 0; i < tiles; i++) {
    const terr = map.terrain[i] as number;
    const row = (i - (i % map.width)) / map.width;
    const water = isWaterTerrain(terr);
    if (terr >= TERRAIN_COUNT) {
      failed('biomes', `tile ${i} has unknown terrain ${terr}`);
    }
    if ((row === 0 || row === map.height - 1) && !water) {
      failed('landmass', `pole row tile ${i} is land`);
    }
    // Elevation 0 ⇔ water — reliefs and pathfinding costs depend on this.
    if (water !== ((map.elevation[i] as number) === 0)) {
      failed('elevation', `tile ${i}: water/elevation mismatch (terrain ${terr})`);
    }
    if (terr === TERRAIN.COAST || terr === TERRAIN.OCEAN) {
      let landOrLake = false;
      for (let d = 0; d < 6; d++) {
        const n = mapNeighbor(map, i, d);
        if (n !== -1 && map.terrain[n] !== TERRAIN.OCEAN && map.terrain[n] !== TERRAIN.COAST) {
          landOrLake = true;
          break;
        }
      }
      if (terr === TERRAIN.COAST && !landOrLake) {
        failed('biomes', `coast tile ${i} touches no land`);
      }
      if (terr === TERRAIN.OCEAN && landOrLake) {
        failed('biomes', `ocean tile ${i} touches land but is not coast`);
      }
    }
    const feat = map.feature[i] as number;
    if (feat >= FEATURE_COUNT) {
      failed('features', `tile ${i} has unknown feature ${feat}`);
    }
    if (
      feat !== FEATURE.NONE &&
      (water || reliefOf(map.elevation[i] as number) === RELIEF.MOUNTAIN)
    ) {
      failed('features', `tile ${i} has feature ${feat} on water or mountain`);
    }
    if ((map.resource[i] as number) >= RESOURCE_COUNT) {
      failed('resources', `tile ${i} has unknown resource ${map.resource[i]}`);
    }
    if ((map.resource[i] as number) === RESOURCE.FISH && terr !== TERRAIN.COAST) {
      failed('resources', `tile ${i} has fish off the coast`);
    }
    if (
      (map.resource[i] as number) !== RESOURCE.NONE &&
      (map.resource[i] as number) !== RESOURCE.FISH &&
      water
    ) {
      failed('resources', `tile ${i} has a land resource on water`);
    }
    // River edges: reciprocal on the neighbor, and never between two
    // open-water tiles (rivers border land or the lake they feed).
    const mask = map.riverEdges[i] as number;
    if (mask >= 64) {
      failed('rivers', `tile ${i} has river bits beyond the 6-edge mask`);
    }
    for (let d = 0; d < 6; d++) {
      if ((mask & (1 << d)) === 0) {
        continue;
      }
      const n = mapNeighbor(map, i, d);
      if (n === -1) {
        failed('rivers', `tile ${i} has a river edge ${d} off the map`);
      }
      if (((map.riverEdges[n] as number) & (1 << oppositeDirection(d))) === 0) {
        failed('rivers', `river edge ${d} of tile ${i} is not reciprocal on tile ${n}`);
      }
      const hereLandOrLake = !water || terr === TERRAIN.LAKE;
      const thereTerr = map.terrain[n] as number;
      const thereLandOrLake = !isWaterTerrain(thereTerr) || thereTerr === TERRAIN.LAKE;
      if (!hereLandOrLake && !thereLandOrLake) {
        failed('rivers', `river edge ${d} of tile ${i} runs through open water`);
      }
    }
  }
  return diagnostics;
}
