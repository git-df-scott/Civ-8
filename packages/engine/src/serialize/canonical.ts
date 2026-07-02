/**
 * Canonical serialization: same logical state ⇒ byte-identical output,
 * regardless of object-key insertion order (doc 04 §3.4).
 *
 * Supported values: null, boolean, finite number, string, arrays, and plain
 * objects. Anything nondeterministic or ambiguous (undefined, NaN, Infinity,
 * functions, symbols, bigint, class instances like Map/Set/Date) throws —
 * engine state must be plain data.
 */

/** The only sanctioned way to enumerate object keys in the engine. */
export function sortedKeys(value: object): string[] {
  // eslint-disable-next-line no-restricted-properties -- sortedKeys is the sanctioned door
  return Object.keys(value).sort();
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalStringify: non-finite number ${value}`);
      }
      // JSON number formatting is fully specified and deterministic.
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
      }
      if (!isPlainObject(value)) {
        throw new TypeError(
          'canonicalStringify: only plain objects and arrays are serializable engine state',
        );
      }
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of sortedKeys(record)) {
        const entry = record[key];
        if (entry === undefined) {
          throw new TypeError(`canonicalStringify: undefined value at key "${key}"`);
        }
        parts.push(`${JSON.stringify(key)}:${canonicalStringify(entry)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalStringify: unsupported type ${typeof value}`);
  }
}
