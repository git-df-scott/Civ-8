import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../src/serialize/base64';
import { createMapState, deserializeMapState, serializeMapState } from '../src/map/grid';
import { GameRng } from '../src/rng/gameRng';
import { generateMap } from '../src/map/mapgen/index';

describe('base64 (engine-pure)', () => {
  it('round-trips all byte values and every length remainder', () => {
    for (const length of [0, 1, 2, 3, 4, 255, 256, 1000]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = (i * 7 + 13) & 0xff;
      }
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('matches the standard encoding', () => {
    // 'Man' → 'TWFu' (RFC 4648 example); padding variants included.
    expect(bytesToBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
    expect(bytesToBase64(new Uint8Array([77, 97]))).toBe('TWE=');
    expect(bytesToBase64(new Uint8Array([77]))).toBe('TQ==');
  });

  it('rejects malformed input loudly', () => {
    expect(() => base64ToBytes('abc')).toThrow(TypeError); // bad length
    expect(() => base64ToBytes('a!c=')).toThrow(TypeError); // bad character
    expect(() => base64ToBytes('TWF!')).toThrow(TypeError);
    expect(() => base64ToBytes('TR==')).toThrow(/padding bits/); // non-canonical
  });
});

describe('MapState serialization', () => {
  it('serialize → deserialize is the identity on a generated map', () => {
    const map = generateMap(new GameRng(7), 'duel');
    const restored = deserializeMapState(serializeMapState(map));
    expect(restored.width).toBe(map.width);
    expect(restored.height).toBe(map.height);
    expect(restored.terrain).toEqual(map.terrain);
    expect(restored.elevation).toEqual(map.elevation);
    expect(restored.feature).toEqual(map.feature);
    expect(restored.resource).toEqual(map.resource);
    expect(restored.riverEdges).toEqual(map.riverEdges);
  });

  it('deserialization rejects wrong-length payloads', () => {
    const serialized = serializeMapState(createMapState(4, 4));
    expect(() => deserializeMapState({ ...serialized, width: 5 })).toThrow(/decodes to/);
  });
});
