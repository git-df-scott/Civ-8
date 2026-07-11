/**
 * Terrain, feature, relief, and resource tables — engine-internal constants
 * for M2. CONTENT-PACK SEAM (doc 04 §2): from M4+ these tables are loaded
 * from @civ8/content JSON; the numeric IDs and the shape of the specs below
 * are exactly what that loader will produce, so mapgen and rendering code
 * will not change when the data moves out.
 */

/** Base terrain per doc 02 §2.1 (water first — see isWaterTerrain). */
export const TERRAIN = {
  OCEAN: 0,
  COAST: 1,
  LAKE: 2,
  GRASSLAND: 3,
  PLAINS: 4,
  DESERT: 5,
  TUNDRA: 6,
  SNOW: 7,
} as const;

export type TerrainId = (typeof TERRAIN)[keyof typeof TERRAIN];

export const TERRAIN_COUNT = 8;

export function isWaterTerrain(terrain: number): boolean {
  return terrain <= TERRAIN.LAKE;
}

export const FEATURE = {
  NONE: 0,
  FOREST: 1,
  JUNGLE: 2,
  MARSH: 3,
} as const;

export type FeatureId = (typeof FEATURE)[keyof typeof FEATURE];

export const FEATURE_COUNT = 4;

export const RESOURCE = {
  NONE: 0,
  IRON: 1,
  HORSES: 2,
  WHEAT: 3,
  STONE: 4,
  FISH: 5,
  GOLD: 6,
} as const;

export type ResourceId = (typeof RESOURCE)[keyof typeof RESOURCE];

export const RESOURCE_COUNT = 7;

/**
 * Relief is derived from the elevation byte (doc 02 §2.1 terrain × relief):
 * water is elevation 0; land is 1..255 with hills and mountains above fixed
 * thresholds.
 */
export const RELIEF = { FLAT: 0, HILLS: 1, MOUNTAIN: 2 } as const;

export type ReliefId = (typeof RELIEF)[keyof typeof RELIEF];

export const HILLS_ELEVATION = 168;
export const MOUNTAIN_ELEVATION = 212;

export function reliefOf(elevation: number): ReliefId {
  if (elevation >= MOUNTAIN_ELEVATION) {
    return RELIEF.MOUNTAIN;
  }
  return elevation >= HILLS_ELEVATION ? RELIEF.HILLS : RELIEF.FLAT;
}

/** Quota-based resource placement spec (mapgen stage 7). */
export interface ResourceSpec {
  readonly id: ResourceId;
  /** Placement quota per 10,000 map tiles (min 2 when any tile qualifies). */
  readonly per10kTiles: number;
  /** Base terrains this resource may occupy. */
  readonly terrains: readonly number[];
  /** Allowed relief classes (water tiles are relief FLAT). */
  readonly reliefs: readonly ReliefId[];
  /** Feature the tile must carry (FEATURE.NONE = must be featureless). */
  readonly requiredFeature?: FeatureId;
}

/** Fixed placement order — part of the deterministic mapgen contract. */
export const RESOURCE_SPECS: readonly ResourceSpec[] = [
  {
    id: RESOURCE.IRON,
    per10kTiles: 28,
    terrains: [TERRAIN.GRASSLAND, TERRAIN.PLAINS, TERRAIN.DESERT, TERRAIN.TUNDRA],
    reliefs: [RELIEF.HILLS],
  },
  {
    id: RESOURCE.HORSES,
    per10kTiles: 24,
    terrains: [TERRAIN.GRASSLAND, TERRAIN.PLAINS],
    reliefs: [RELIEF.FLAT],
    requiredFeature: FEATURE.NONE,
  },
  {
    id: RESOURCE.WHEAT,
    per10kTiles: 30,
    terrains: [TERRAIN.GRASSLAND, TERRAIN.PLAINS],
    reliefs: [RELIEF.FLAT],
    requiredFeature: FEATURE.NONE,
  },
  {
    id: RESOURCE.STONE,
    per10kTiles: 22,
    terrains: [TERRAIN.GRASSLAND, TERRAIN.PLAINS, TERRAIN.TUNDRA, TERRAIN.SNOW],
    reliefs: [RELIEF.FLAT, RELIEF.HILLS],
  },
  {
    id: RESOURCE.FISH,
    per10kTiles: 34,
    terrains: [TERRAIN.COAST],
    reliefs: [RELIEF.FLAT],
  },
  {
    id: RESOURCE.GOLD,
    per10kTiles: 14,
    terrains: [TERRAIN.DESERT, TERRAIN.PLAINS],
    reliefs: [RELIEF.HILLS],
  },
];
