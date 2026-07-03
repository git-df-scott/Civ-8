import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SortedMap } from '../src/index';

/** Unique keys with values derived from them, plus a shuffled permutation. */
const entriesAndPermutationArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 1_000_000 }), { maxLength: 100 })
  .map((keys) => keys.map((key): [number, string] => [key, `v${key}`]))
  .chain((entries) =>
    fc.tuple(fc.constant(entries), fc.shuffledSubarray(entries, { minLength: entries.length })),
  );

describe('SortedMap (property)', () => {
  it('iteration order and serialized form are invariant under insertion order [500 runs]', () => {
    fc.assert(
      fc.property(entriesAndPermutationArb, ([entries, shuffled]) => {
        const a = SortedMap.fromEntries(entries);
        const b = SortedMap.fromEntries(shuffled);
        const ascending = entries.map(([k]) => k).sort((x, y) => x - y);

        expect([...a.keys()]).toEqual(ascending);
        expect([...b.keys()]).toEqual(ascending);
        expect(b.entries()).toEqual(a.entries());
        expect(b.values()).toEqual(a.values());
        expect(b.toEntries()).toEqual(a.toEntries());
      }),
      { numRuns: 500 },
    );
  });

  it('set/delete keep ascending order [200 runs]', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 50 }),
        (keys) => {
          const map = new SortedMap<number, number>();
          for (const key of keys) {
            map.set(key, key);
          }
          const removed = keys[0] as number;
          map.delete(removed);
          const expected = keys.filter((k) => k !== removed).sort((x, y) => x - y);
          expect([...map.keys()]).toEqual(expected);
          expect(map.has(removed)).toBe(false);
          expect(map.size).toBe(expected.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});
