/**
 * sim argument parsing, extracted from sim.ts so it is unit-testable
 * (M0-review carry-over): parsing throws SimUsageError instead of calling
 * process.exit, and sim.ts owns the exit codes.
 */

/** Seeds are 32-bit: anything larger would silently alias mod 2^32. */
export const MAX_SEED = 4294967295;
/** Sanity cap — a million turns is far beyond any legitimate run. */
export const MAX_TURNS = 1000000;

export class SimUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimUsageError';
  }
}

export interface SimArgs {
  seed: number;
  maxTurns: number;
  /** True when --help/-h was given: print usage, run nothing. */
  help: boolean;
}

export const SIM_USAGE = 'Usage: sim --seed <n> --max-turns <n>\n';

export function parseSimArgs(argv: readonly string[]): SimArgs {
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
        throw new SimUsageError(`missing value for ${arg}`);
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new SimUsageError(`${arg} must be a non-negative integer, got "${raw}"`);
      }
      if (arg === '--seed') {
        if (value > MAX_SEED) {
          throw new SimUsageError(`--seed must be at most ${MAX_SEED} (2^32 - 1), got "${raw}"`);
        }
        seed = value;
      } else {
        if (value > MAX_TURNS) {
          throw new SimUsageError(`--max-turns must be at most ${MAX_TURNS}, got "${raw}"`);
        }
        maxTurns = value;
      }
      i++;
    } else if (arg === '--help' || arg === '-h') {
      return { seed, maxTurns, help: true };
    } else {
      throw new SimUsageError(`unknown argument "${arg ?? ''}"`);
    }
  }
  return { seed, maxTurns, help: false };
}
