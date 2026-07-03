/**
 * Golden-log fixtures: recorded (seed, commandLog) runs with their expected
 * hash chains. Regenerated only via `pnpm goldens:update`; verified by the
 * replay CLI (src/replay.ts) and the vitest suite (test/goldenLogs.test.ts).
 * An unexplained hash change here means determinism broke.
 *
 * The final hash is NOT stored separately: it is by definition the last entry
 * of expectedTurnHashes (every fixture records at least one EndTurn), so
 * there is a single source of truth.
 */

import { fileURLToPath } from 'node:url';
import { Game, isKnownCommand, runEndTurns, validateTurnHashes, type Command } from '@civ8/engine';

export const GOLDEN_LOGS_DIR = fileURLToPath(
  new URL('../../../test-fixtures/golden-logs/', import.meta.url),
);

export interface GoldenFixture {
  /** Human-readable description of the recorded run. */
  readonly description: string;
  readonly seed: number;
  readonly commandLog: Command[];
  /** Per-EndTurn hash chain; the last entry is the run's final hash. */
  readonly expectedTurnHashes: string[];
}

/** The recorded runs. Adding a fixture = one entry + `pnpm goldens:update`. */
export const GOLDEN_RUNS: ReadonlyArray<{ file: string; seed: number; endTurns: number }> = [
  { file: 'seed-1-endturns-10.json', seed: 1, endTurns: 10 },
  { file: 'seed-42-endturns-25.json', seed: 42, endTurns: 25 },
];

// Every golden run must record at least one EndTurn, so "final hash = last
// turn hash" is total and expectedFinalHash needs no separate field.
for (const run of GOLDEN_RUNS) {
  if (!Number.isInteger(run.endTurns) || run.endTurns < 1) {
    throw new Error(`GOLDEN_RUNS: ${run.file} must have endTurns >= 1, got ${run.endTurns}`);
  }
}

/** The fixture's recorded final hash: the last entry of its hash chain. */
export function fixtureFinalHash(fixture: GoldenFixture): string {
  return fixture.expectedTurnHashes[fixture.expectedTurnHashes.length - 1] as string;
}

export function generateFixture(seed: number, endTurns: number): GoldenFixture {
  if (!Number.isInteger(endTurns) || endTurns < 1) {
    throw new Error(`generateFixture: endTurns must be >= 1, got ${endTurns}`);
  }
  const game = Game.create({ seed });
  const run = runEndTurns(game, endTurns);
  return {
    description: `seed ${seed}, ${endTurns} EndTurns`,
    seed,
    commandLog: [...game.log],
    expectedTurnHashes: run.turnHashes,
  };
}

export type VerifyResult = { ok: true; finalHash: string } | { ok: false; message: string };

/** Replays a fixture's command log and compares the resulting hash chain. */
export function verifyFixture(fixture: GoldenFixture): VerifyResult {
  const game = Game.replay(fixture.seed, fixture.commandLog);
  const actual = game.turnHashes;
  const expected = fixture.expectedTurnHashes;
  if (actual.length !== expected.length) {
    return {
      ok: false,
      message:
        `turn-hash count mismatch: expected ${expected.length} hashes, ` +
        `replay produced ${actual.length}`,
    };
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      return {
        ok: false,
        message:
          `turn hash ${i} mismatch: expected ${expected[i] ?? '<missing>'}, ` +
          `replay produced ${actual[i] ?? '<missing>'}`,
      };
    }
  }
  // Chains match and are non-empty (endTurns >= 1), so the final hash is the
  // last entry — the single source of truth.
  return { ok: true, finalHash: fixtureFinalHash(fixture) };
}

/**
 * Structural check for a freshly parsed fixture file. Throws on bad shape.
 * Hash and command validation reuse the engine's save-validation module
 * (@civ8/engine validateTurnHashes / isKnownCommand), so fixture validation
 * is exactly as strict as save validation: a bad hex hash or unknown command
 * type is a clean parse error.
 */
export function parseFixture(raw: unknown, source: string): GoldenFixture {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: fixture must be a JSON object`);
  }
  const record = raw as Record<string, unknown>;
  const { description, seed, commandLog, expectedTurnHashes } = record;
  if (typeof description !== 'string') {
    throw new Error(`${source}: "description" must be a string`);
  }
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) {
    throw new Error(`${source}: "seed" must be a non-negative integer`);
  }
  if (!Array.isArray(commandLog)) {
    throw new Error(`${source}: "commandLog" must be an array`);
  }
  const commands = commandLog.map((entry: unknown, i): Command => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${source}: "commandLog"[${i}] must be a command object`);
    }
    const type = (entry as { type?: unknown }).type;
    if (typeof type !== 'string' || !isKnownCommand(type)) {
      throw new Error(
        `${source}: "commandLog"[${i}].type must be a known command type, got ${JSON.stringify(type)}`,
      );
    }
    return entry as Command;
  });
  // Engine-strict hash validation (^[0-9a-f]{16}$ per entry); throws
  // SaveLoadError with a clear path on any bad entry.
  const hashes = validateTurnHashes(expectedTurnHashes, `${source}: "expectedTurnHashes"`);
  if (hashes.length < 1) {
    throw new Error(
      `${source}: "expectedTurnHashes" must have at least one entry (fixtures record >= 1 EndTurn)`,
    );
  }
  return {
    description,
    seed,
    commandLog: commands,
    expectedTurnHashes: hashes,
  };
}
