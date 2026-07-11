/**
 * sim — the headless determinism harness.
 *
 * Creates a Game from --seed, executes EndTurn --max-turns times via the
 * engine's shared turn-runner, and prints the per-EndTurn hash chain plus the
 * final hash as JSON on stdout. CI runs this twice with the same seed and
 * diffs the outputs (the determinism double-run). Arg parsing lives in
 * simArgs.ts (unit-tested); this file owns process I/O and exit codes.
 *
 * Usage: sim --seed 1 --max-turns 10
 */

import process from 'node:process';
import { Game, runEndTurns } from '@civ8/engine';
import { SIM_USAGE, SimUsageError, parseSimArgs } from './simArgs';

function main(): void {
  let args;
  try {
    args = parseSimArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof SimUsageError) {
      process.stderr.write(`sim: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
  if (args.help) {
    process.stdout.write(SIM_USAGE);
    process.exit(0);
  }
  const { seed, maxTurns } = args;
  const game = Game.create({ seed });
  const run = runEndTurns(game, maxTurns);
  const report = {
    seed,
    maxTurns,
    finalTurn: game.turn,
    turnHashes: run.turnHashes,
    finalHash: run.finalHash,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
