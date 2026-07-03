import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, sortedKeys } from '../src/index';

/** Rebuild `value` with object keys inserted in reverse-sorted order. */
function withReversedKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withReversedKeyOrder(item));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const rebuilt: Record<string, unknown> = {};
    for (const key of sortedKeys(record).reverse()) {
      rebuilt[key] = withReversedKeyOrder(record[key]);
    }
    return rebuilt;
  }
  return value;
}

describe('canonical serialization (property)', () => {
  it('round-trips: JSON.parse(canonicalStringify(v)) is JSON-equivalent to v [500 runs]', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const canonical = canonicalStringify(value);
        // Compare through JSON.parse on both sides so -0 normalizes identically.
        expect(JSON.parse(canonical)).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 500 },
    );
  });

  it('is key-order independent: same logical object => byte-identical output [500 runs]', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(canonicalStringify(withReversedKeyOrder(value))).toBe(canonicalStringify(value));
      }),
      { numRuns: 500 },
    );
  });

  it('is stable: stringifying twice yields byte-identical output [200 runs]', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(canonicalStringify(value)).toBe(canonicalStringify(value));
      }),
      { numRuns: 200 },
    );
  });
});
