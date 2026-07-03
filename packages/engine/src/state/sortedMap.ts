/**
 * SortedMap — the engine's only keyed collection (doc 04 §3.1).
 *
 * A thin wrapper over Map<number, V> that guarantees ascending-numeric-key
 * iteration for keys(), values(), and entries(), killing the #1 source of
 * nondeterminism (insertion-order-dependent Map iteration). Serializable via
 * toEntries() (ascending [key, value] pairs — plain data, canonical-friendly)
 * and restorable via SortedMap.fromEntries().
 */

export class SortedMap<K extends number, V> {
  private readonly inner = new Map<K, V>();
  /** Ascending key cache; invalidated whenever the key set changes. */
  private sortedCache: readonly K[] | null = null;

  static fromEntries<K extends number, V>(entries: Iterable<readonly [K, V]>): SortedMap<K, V> {
    const map = new SortedMap<K, V>();
    for (const [key, value] of entries) {
      map.set(key, value);
    }
    return map;
  }

  get size(): number {
    return this.inner.size;
  }

  has(key: K): boolean {
    return this.inner.has(key);
  }

  get(key: K): V | undefined {
    return this.inner.get(key);
  }

  set(key: K, value: V): this {
    if (!Number.isFinite(key)) {
      throw new RangeError(`SortedMap keys must be finite numbers, got ${key}`);
    }
    if (!this.inner.has(key)) {
      this.sortedCache = null;
    }
    this.inner.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    const removed = this.inner.delete(key);
    if (removed) {
      this.sortedCache = null;
    }
    return removed;
  }

  /**
   * Keys in ascending numeric order. The returned array is frozen (it is the
   * internal cache, shared across calls to keep reads allocation-free): a
   * caller's `sort()`/`reverse()`/push cannot corrupt iteration order for
   * later reads. The cache is never mutated in place — key-set changes
   * invalidate it by replacing it (see set/delete).
   */
  keys(): readonly K[] {
    if (this.sortedCache === null) {
      this.sortedCache = Object.freeze([...this.inner.keys()].sort((a, b) => a - b));
    }
    return this.sortedCache;
  }

  /** Values in ascending key order. */
  values(): V[] {
    return this.keys().map((key) => this.inner.get(key) as V);
  }

  /** [key, value] pairs in ascending key order. */
  entries(): Array<[K, V]> {
    return this.keys().map((key) => [key, this.inner.get(key) as V]);
  }

  /** Serializable form: plain ascending [key, value] pairs. */
  toEntries(): Array<[K, V]> {
    return this.entries();
  }
}
