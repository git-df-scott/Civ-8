/**
 * sim argument parsing, extracted from sim.ts so it is unit-testable (the
 * sim entry point exits the process; this module only returns or throws).
 */

/** Seeds are 32-bit: anything larger would silently alias mod 2^32. */
export const MAX_SEED = 4294967295;
/** Sanity cap — a million turns is far beyond any legitimate run. */
export const MAX_TURNS = 1000000;

export interface SimArgs {
  readonly seed: number;
  readonly maxTurns: number;
}

export type SimArgsResult = { kind: 'run'; args: SimArgs } | { kind: 'help' };

export class SimArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimArgError';
  }
}

export function parseSimArgs(argv: readonly string[]): SimArgsResult {
  let seed = 1;
  let maxTurns = 10;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      continue; // pnpm forwards the literal "--" separator
    }
    if (arg === '--seed' || arg === '--max-turns') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        throw new SimArgError(`missing value for ${arg}`);
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new SimArgError(`${arg} must be a non-negative integer, got "${raw}"`);
      }
      if (arg === '--seed') {
        if (value > MAX_SEED) {
          throw new SimArgError(`--seed must be at most ${MAX_SEED} (2^32 - 1), got "${raw}"`);
        }
        seed = value;
      } else {
        if (value > MAX_TURNS) {
          throw new SimArgError(`--max-turns must be at most ${MAX_TURNS}, got "${raw}"`);
        }
        maxTurns = value;
      }
      i++;
    } else if (arg === '--help' || arg === '-h') {
      return { kind: 'help' };
    } else {
      throw new SimArgError(`unknown argument "${arg ?? ''}"`);
    }
  }
  return { kind: 'run', args: { seed, maxTurns } };
}
