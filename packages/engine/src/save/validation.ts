/**
 * Shared save-validation primitives (doc 04 §3.4), used by both the engine's
 * save loader (serialize/migrations) and the CLI's golden-fixture parser, so
 * fixture validation is exactly as strict as save validation — a bad hex hash
 * or unknown command type fails the same way in both.
 */

export { isKnownCommand } from '../commands/registry';

export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveLoadError';
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

/** Throws SaveLoadError with a clear expected/actual message for `path`. */
export function fail(path: string, expected: string, actual: unknown): never {
  throw new SaveLoadError(
    `Invalid save: expected ${expected} at "${path}", got ${describe(actual)}`,
  );
}

const TURN_HASH_PATTERN = /^[0-9a-f]{16}$/;

/** Validates an array of 16-char lowercase hex turn hashes. */
export function validateTurnHashes(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    fail(path, 'an array of hash strings', value);
  }
  return value.map((entry: unknown, i) => {
    if (typeof entry !== 'string') {
      fail(`${path}[${i}]`, 'a string', entry);
    }
    if (!TURN_HASH_PATTERN.test(entry)) {
      fail(`${path}[${i}]`, 'a 16-char lowercase hex hash', entry);
    }
    return entry;
  });
}
