/**
 * MapState — struct-of-typed-arrays tile storage (doc 04 §4), indexed by
 * `TileIndex = row * width + col` (see map/hex.ts for the coordinate model).
 * ~5 bytes/tile ⇒ a huge map (128×80) is ~50KB and serializes to base64.
 *
 * The grid API is deliberately shaped so M3 pathfinding slots in: neighbor
 * iteration is `neighborTile(index, d, width, height)` over the fixed
 * direction order, and all per-tile facts are O(1) array reads.
 */

import { base64ToBytes, bytesToBase64 } from '../serialize/base64';
import { neighborTile } from './hex';

export interface MapState {
  readonly width: number;
  readonly height: number;
  /** Base terrain (map/terrain.ts TERRAIN). */
  readonly terrain: Uint8Array;
  /** 0 = water; land 1..255, relief derived via reliefOf(). */
  readonly elevation: Uint8Array;
  /** Feature overlay (FEATURE). */
  readonly feature: Uint8Array;
  /** Resource (RESOURCE). */
  readonly resource: Uint8Array;
  /** 6-edge river bitmask; bit d = river on edge d (hex.ts direction order). */
  readonly riverEdges: Uint8Array;
}

/** Canonical plain-data form: typed arrays → base64 (doc 04 §3.4). */
export interface SerializedMapState {
  readonly width: number;
  readonly height: number;
  readonly terrain: string;
  readonly elevation: string;
  readonly feature: string;
  readonly resource: string;
  readonly riverEdges: string;
}

export function createMapState(width: number, height: number): MapState {
  const tiles = width * height;
  return {
    width,
    height,
    terrain: new Uint8Array(tiles),
    elevation: new Uint8Array(tiles),
    feature: new Uint8Array(tiles),
    resource: new Uint8Array(tiles),
    riverEdges: new Uint8Array(tiles),
  };
}

export function tileCount(map: MapState): number {
  return map.width * map.height;
}

/** The neighbor of `index` in direction `d`, or -1 off the north/south edge. */
export function mapNeighbor(map: MapState, index: number, d: number): number {
  return neighborTile(index, d, map.width, map.height);
}

export function serializeMapState(map: MapState): SerializedMapState {
  return {
    width: map.width,
    height: map.height,
    terrain: bytesToBase64(map.terrain),
    elevation: bytesToBase64(map.elevation),
    feature: bytesToBase64(map.feature),
    resource: bytesToBase64(map.resource),
    riverEdges: bytesToBase64(map.riverEdges),
  };
}

function decodeField(text: string, expected: number, field: string): Uint8Array {
  const bytes = base64ToBytes(text);
  if (bytes.length !== expected) {
    throw new TypeError(
      `deserializeMapState: ${field} decodes to ${bytes.length} bytes, expected ${expected}`,
    );
  }
  return bytes;
}

export function deserializeMapState(serialized: SerializedMapState): MapState {
  const tiles = serialized.width * serialized.height;
  return {
    width: serialized.width,
    height: serialized.height,
    terrain: decodeField(serialized.terrain, tiles, 'terrain'),
    elevation: decodeField(serialized.elevation, tiles, 'elevation'),
    feature: decodeField(serialized.feature, tiles, 'feature'),
    resource: decodeField(serialized.resource, tiles, 'resource'),
    riverEdges: decodeField(serialized.riverEdges, tiles, 'riverEdges'),
  };
}
