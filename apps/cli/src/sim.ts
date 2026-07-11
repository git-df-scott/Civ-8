/**
 * sim — the headless determinism harness.
 *
 * Creates a Game from --seed, executes EndTurn --max-turns times via the
 * engine's shared turn-runner, and prints the per-EndTurn hash chain plus the
 * final hash as JSON on stdout. CI runs this twice with the same seed and
 * diffs the outputs (the determinism double-run).
 *
 * Usage: sim --seed 1 --max-turns 10
 * Argument parsing lives in simArgs.ts (unit-tested).
 */

import process from 'node:process';
import { Game, runEndTurns } from '@civ8/engine';
import { parseSimArgs, SimArgError } from './simArgs';

function fail(message: string): never {
  process.stderr.write(`sim: ${message}\n`);
  process.exit(1);
}

function main(): void {
  let parsed;
  try {
    parsed = parseSimArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof SimArgError ? error.message : String(error));
  }
  if (parsed.kind === 'help') {
    process.stdout.write('Usage: sim --seed <n> --max-turns <n>\n');
    return;
  }
  const { seed, maxTurns } = parsed.args;
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
