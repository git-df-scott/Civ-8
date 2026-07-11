/**
 * Terrain, feature, and resource tables — engine-internal constants for M2.
 *
 * CONTENT-PACK SEAM (doc 04 §2): these become data-driven content
 * (packages/content terrain/resource schemas) in M4+. Rules code must go
 * through the helpers here (isWaterTerrain, reliefOf, …), never compare raw
 * bytes, so swapping the backing store for pack data is a local change.
 */

/** Base terrain (doc 02 §2.1), stored per tile in MapState.terrain. */
export const TERRAIN = {
  Ocean: 0,
  Coast: 1,
  /** Inland water created by river tracing when flow gets trapped. */
  Lake: 2,
  Grassland: 3,
  Plains: 4,
  Desert: 5,
  Tundra: 6,
  Snow: 7,
} as const;

export type TerrainId = (typeof TERRAIN)[keyof typeof TERRAIN];
export const TERRAIN_COUNT = 8;

export function isWaterTerrain(terrain: number): boolean {
  return terrain === TERRAIN.Ocean || terrain === TERRAIN.Coast || terrain === TERRAIN.Lake;
}

/** Tile features (forest/jungle/marsh in M2), stored in MapState.feature. */
export const FEATURE = {
  None: 0,
  Forest: 1,
  Jungle: 2,
  Marsh: 3,
} as const;

export type FeatureId = (typeof FEATURE)[keyof typeof FEATURE];
export const FEATURE_COUNT = 4;

/** Strategic/bonus resources (M2 starter set), stored in MapState.resource. */
export const RESOURCE = {
  None: 0,
  Wheat: 1,
  Cattle: 2,
  Horses: 3,
  Iron: 4,
  Stone: 5,
  Gold: 6,
  Furs: 7,
  Fish: 8,
} as const;

export type ResourceId = (typeof RESOURCE)[keyof typeof RESOURCE];
export const RESOURCE_COUNT = 9;

/**
 * Relief is derived from the elevation byte (doc 02 §2.1 base × relief):
 * elevation is a 0..255 heightfield (water tiles sit below ELEVATION_LAND_MIN;
 * mapgen shapes land into [ELEVATION_LAND_MIN, 255]); hills and mountains are
 * fixed thresholds on it. No separate relief array (doc 04 §4 array set).
 */
export const ELEVATION_LAND_MIN = 40;
export const ELEVATION_HILLS_MIN = 170;
export const ELEVATION_MOUNTAIN_MIN = 210;

export const RELIEF = { Flat: 0, Hills: 1, Mountain: 2 } as const;
export type ReliefId = (typeof RELIEF)[keyof typeof RELIEF];

export function reliefOf(elevation: number): ReliefId {
  if (elevation >= ELEVATION_MOUNTAIN_MIN) {
    return RELIEF.Mountain;
  }
  return elevation >= ELEVATION_HILLS_MIN ? RELIEF.Hills : RELIEF.Flat;
}
