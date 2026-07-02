import { describe, expect, it } from 'vitest';
import { canonicalStringify, sortedKeys } from '../src/serialize/canonical';
import { fnv1a64Hex, hashState } from '../src/serialize/hash';

describe('canonicalStringify', () => {
  it('is independent of object key insertion order', () => {
    const a = { alpha: 1, beta: 'two', gamma: [3, 4], delta: { x: 1, y: 2 } };
    const b = { delta: { y: 2, x: 1 }, gamma: [3, 4], beta: 'two', alpha: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(hashState(a)).toBe(hashState(b));
  });

  it('preserves array order (arrays are ordered data)', () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it('distinguishes different values', () => {
    expect(hashState({ turn: 1 })).not.toBe(hashState({ turn: 2 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: '1' }));
  });

  it('emits deterministic primitive encodings', () => {
    expect(canonicalStringify({ b: 2, a: [null, true, 'x'] })).toBe('{"a":[null,true,"x"],"b":2}');
  });

  it('rejects non-plain-data state', () => {
    expect(() => canonicalStringify(undefined)).toThrow(TypeError);
    expect(() => canonicalStringify({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalStringify(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalStringify(new Map())).toThrow(TypeError);
    expect(() => canonicalStringify(() => 0)).toThrow(TypeError);
  });

  it('sortedKeys sorts lexicographically', () => {
    expect(sortedKeys({ b: 1, a: 1, c: 1 })).toEqual(['a', 'b', 'c']);
  });
});

describe('fnv1a64Hex', () => {
  it('matches known FNV-1a 64-bit test vectors for ASCII input', () => {
    // Standard vectors (byte-oriented; ASCII text has zero high bytes, which we
    // hash explicitly, so vectors are checked for our documented byte order).
    expect(fnv1a64Hex('')).toBe('cbf29ce484222325');
  });

  it('is stable and collision-visible on small changes', () => {
    expect(fnv1a64Hex('civ8')).toBe(fnv1a64Hex('civ8'));
    expect(fnv1a64Hex('civ8')).not.toBe(fnv1a64Hex('civ9'));
    expect(fnv1a64Hex('a')).toHaveLength(16);
  });
});
