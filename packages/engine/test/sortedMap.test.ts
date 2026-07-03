import { describe, expect, it } from 'vitest';
import { SortedMap } from '../src/index';

describe('SortedMap', () => {
  it('mutating the array returned by keys() cannot affect later iteration order', () => {
    const map = SortedMap.fromEntries<number, string>([
      [3, 'c'],
      [1, 'a'],
      [2, 'b'],
    ]);
    const keys = map.keys() as number[];
    expect(keys).toEqual([1, 2, 3]);

    // The returned array is frozen: in-place mutation must either throw
    // (strict mode) or be a no-op — never corrupt subsequent reads.
    try {
      keys.reverse();
    } catch {
      // expected under strict mode (frozen array)
    }
    try {
      keys.sort((a, b) => b - a);
    } catch {
      // expected under strict mode (frozen array)
    }
    try {
      keys.push(0);
    } catch {
      // expected under strict mode (frozen array)
    }

    expect([...map.keys()]).toEqual([1, 2, 3]);
    expect(map.values()).toEqual(['a', 'b', 'c']);
    expect(map.entries()).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
  });

  it('the cache is invalidated by replacement, not in-place mutation, on set/delete', () => {
    const map = SortedMap.fromEntries<number, string>([
      [1, 'a'],
      [3, 'c'],
    ]);
    const before = map.keys();
    map.set(2, 'b');
    expect([...map.keys()]).toEqual([1, 2, 3]);
    expect([...before]).toEqual([1, 3]); // earlier callers' view is untouched
    map.delete(1);
    expect([...map.keys()]).toEqual([2, 3]);
  });
});
