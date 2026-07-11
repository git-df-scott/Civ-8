import { describe, expect, it } from 'vitest';
import {
  cloneMapState,
  createEmptyMapState,
  deserializeMapState,
  hasAnyRiverEdge,
  hasRiverEdge,
  riverEdgesAreMirrored,
  serializeMapState,
  setRiverEdge,
} from '../src/map/grid';
import { neighborIndex, oppositeDirection, toTileIndex } from '../src/map/hex';
import { tileIndex } from '../src/ids';
import { generateMapForSeed } from '../src/map/mapgen/index';

describe('MapState grid', () => {
  it('serialize → deserialize round-trips byte-identically', () => {
    const map = generateMapForSeed(7, 'duel');
    const restored = deserializeMapState(serializeMapState(map));
    expect(restored.width).toBe(map.width);
    expect(restored.height).toBe(map.height);
    expect([...restored.terrain]).toEqual([...map.terrain]);
    expect([...restored.feature]).toEqual([...map.feature]);
    expect([...restored.elevation]).toEqual([...map.elevation]);
    expect([...restored.resource]).toEqual([...map.resource]);
    expect([...restored.riverEdges]).toEqual([...map.riverEdges]);
  });

  it('deserializeMapState rejects arrays of the wrong length', () => {
    const serialized = serializeMapState(createEmptyMapState(8, 6));
    const truncated = { ...serialized, terrain: 'AAAA' };
    expect(() => deserializeMapState(truncated)).toThrow(/terrain has 3 bytes, expected 48/);
  });

  it('createEmptyMapState validates dimensions', () => {
    expect(() => createEmptyMapState(1, 10)).toThrow(RangeError);
    expect(() => createEmptyMapState(10.5, 10)).toThrow(RangeError);
  });

  it('setRiverEdge mirrors the bit on the neighbor across the edge', () => {
    const map = createEmptyMapState(8, 6);
    const tile = toTileIndex(3, 2, 8);
    for (let d = 0; d < 6; d++) {
      setRiverEdge(map, tile, d);
      const neighbor = neighborIndex(tile, d, 8, 6);
      expect(hasRiverEdge(map, tile, d)).toBe(true);
      expect(hasRiverEdge(map, tileIndex(neighbor), oppositeDirection(d))).toBe(true);
    }
    expect(hasAnyRiverEdge(map, tile)).toBe(true);
    expect(riverEdgesAreMirrored(map)).toBe(true);
  });

  it('setRiverEdge refuses edges that fall off the poles', () => {
    const map = createEmptyMapState(8, 6);
    expect(() => setRiverEdge(map, toTileIndex(3, 0, 8), 1)).toThrow(/no neighbor/);
    expect(() => setRiverEdge(map, toTileIndex(3, 5, 8), 5)).toThrow(/no neighbor/);
  });

  it('riverEdgesAreMirrored detects a hand-broken mask', () => {
    const map = createEmptyMapState(8, 6);
    setRiverEdge(map, toTileIndex(3, 2, 8), 0);
    expect(riverEdgesAreMirrored(map)).toBe(true);
    map.riverEdges[toTileIndex(5, 3, 8)] = 1 << 2; // no mirror on the other side
    expect(riverEdgesAreMirrored(map)).toBe(false);
  });

  it('cloneMapState is a deep copy', () => {
    const map = generateMapForSeed(1, 'duel');
    const clone = cloneMapState(map);
    clone.terrain[0] = 99;
    expect(map.terrain[0]).not.toBe(99);
  });
});
