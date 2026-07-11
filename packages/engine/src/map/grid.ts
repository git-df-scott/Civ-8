/**
 * MapState — struct-of-typed-arrays tile storage (doc 04 §4).
 *
 * One Uint8Array per attribute, indexed by TileIndex = r * width + q:
 * ~5 bytes/tile, so a huge (128×80) map is ~50KB and serializes to base64
 * trivially. No per-tile objects, ever (doc 04 §7).
 *
 * riverEdges is a 6-bit edge bitmask per tile: bit d = a river runs along
 * the hex side shared with neighbor(d) (map/hex.ts HEX_DIRECTIONS order).
 * The mask is MIRRORED — the same physical edge is set on both tiles
 * (bit d here ⇔ bit (d+3)%6 on the neighbor) — so rules and rendering read
 * locally without neighbor lookups. setRiverEdge maintains the invariant;
 * mapgen validation and save validation both assert it.
 *
 * ownerCity/improvement arrays arrive with their milestones (M3/M4) as new
 * fields here plus a save migration each.
 */

import { neighborIndex, oppositeDirection } from './hex';
import type { TileIndex } from '../ids';
import { bytesToBase64, base64ToBytes } from '../serialize/base64';

/** Map sizes and default player counts per doc 02 §2.1. */
export const MAP_SIZES = {
  duel: { width: 56, height: 36 },
  small: { width: 72, height: 46 },
  standard: { width: 92, height: 60 },
  large: { width: 110, height: 70 },
  huge: { width: 128, height: 80 },
} as const;

export type MapSizeName = keyof typeof MAP_SIZES;

export const MAP_SIZE_NAMES: readonly MapSizeName[] = [
  'duel',
  'small',
  'standard',
  'large',
  'huge',
];

export function isMapSizeName(value: string): value is MapSizeName {
  return Object.prototype.hasOwnProperty.call(MAP_SIZES, value);
}

export interface MapState {
  readonly width: number;
  readonly height: number;
  /** TerrainId per tile (map/terrain.ts TERRAIN). */
  readonly terrain: Uint8Array;
  /** FeatureId per tile (FEATURE). */
  readonly feature: Uint8Array;
  /** 0..255 heightfield; relief derives via reliefOf() (terrain.ts). */
  readonly elevation: Uint8Array;
  /** ResourceId per tile (RESOURCE). */
  readonly resource: Uint8Array;
  /** Mirrored 6-bit river-edge bitmask (see module doc). */
  readonly riverEdges: Uint8Array;
}

/** Canonical plain-data form: typed arrays → base64 (doc 04 §3.4). */
export interface SerializedMapState {
  readonly width: number;
  readonly height: number;
  readonly terrain: string;
  readonly feature: string;
  readonly elevation: string;
  readonly resource: string;
  readonly riverEdges: string;
}

export function createEmptyMapState(width: number, height: number): MapState {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new RangeError(`createEmptyMapState: bad dimensions ${width}x${height}`);
  }
  const tiles = width * height;
  return {
    width,
    height,
    terrain: new Uint8Array(tiles),
    feature: new Uint8Array(tiles),
    elevation: new Uint8Array(tiles),
    resource: new Uint8Array(tiles),
    riverEdges: new Uint8Array(tiles),
  };
}

export function cloneMapState(map: MapState): MapState {
  return {
    width: map.width,
    height: map.height,
    terrain: map.terrain.slice(),
    feature: map.feature.slice(),
    elevation: map.elevation.slice(),
    resource: map.resource.slice(),
    riverEdges: map.riverEdges.slice(),
  };
}

export function serializeMapState(map: MapState): SerializedMapState {
  return {
    width: map.width,
    height: map.height,
    terrain: bytesToBase64(map.terrain),
    feature: bytesToBase64(map.feature),
    elevation: bytesToBase64(map.elevation),
    resource: bytesToBase64(map.resource),
    riverEdges: bytesToBase64(map.riverEdges),
  };
}

/**
 * Decode a serialized map. Structural/range validation lives in the save
 * loader (serialize/migrations); this decodes and checks lengths so a
 * truncated array can never load, even through internal call sites.
 */
export function deserializeMapState(serialized: SerializedMapState): MapState {
  const { width, height } = serialized;
  const tiles = width * height;
  const decode = (text: string, name: string): Uint8Array => {
    const bytes = base64ToBytes(text);
    if (bytes.length !== tiles) {
      throw new RangeError(
        `deserializeMapState: ${name} has ${bytes.length} bytes, expected ${tiles}`,
      );
    }
    return bytes;
  };
  return {
    width,
    height,
    terrain: decode(serialized.terrain, 'terrain'),
    feature: decode(serialized.feature, 'feature'),
    elevation: decode(serialized.elevation, 'elevation'),
    resource: decode(serialized.resource, 'resource'),
    riverEdges: decode(serialized.riverEdges, 'riverEdges'),
  };
}

/** True when a river runs along side d of the tile. */
export function hasRiverEdge(map: MapState, index: TileIndex, d: number): boolean {
  return ((map.riverEdges[index] as number) & (1 << d)) !== 0;
}

/** True when any river runs along any side of the tile (plain-number index for loops). */
export function hasAnyRiverEdge(map: MapState, index: number): boolean {
  return (map.riverEdges[index] as number) !== 0;
}

/**
 * Marks a river along side d of the tile AND the matching side of the
 * neighbor across it (the mirror invariant). The edge must be interior —
 * both tiles on the cylinder — which mapgen guarantees (rivers never touch
 * the pole rows' outer edges).
 */
export function setRiverEdge(map: MapState, index: TileIndex, d: number): void {
  const neighbor = neighborIndex(index, d, map.width, map.height);
  if (neighbor < 0) {
    throw new RangeError(`setRiverEdge: side ${d} of tile ${index} has no neighbor (map edge)`);
  }
  map.riverEdges[index] = (map.riverEdges[index] as number) | (1 << d);
  map.riverEdges[neighbor] = (map.riverEdges[neighbor] as number) | (1 << oppositeDirection(d));
}

/** True when every river-edge bit is mirrored on the tile across it. */
export function riverEdgesAreMirrored(map: MapState): boolean {
  for (let index = 0; index < map.riverEdges.length; index++) {
    const mask = map.riverEdges[index] as number;
    if (mask === 0) {
      continue;
    }
    for (let d = 0; d < 6; d++) {
      if ((mask & (1 << d)) === 0) {
        continue;
      }
      const neighbor = neighborIndex(index as TileIndex, d, map.width, map.height);
      if (neighbor < 0) {
        return false;
      }
      if (((map.riverEdges[neighbor] as number) & (1 << oppositeDirection(d))) === 0) {
        return false;
      }
    }
  }
  return true;
}
