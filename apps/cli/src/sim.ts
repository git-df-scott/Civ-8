/**
 * sim — the headless determinism harness (M0 shape).
 *
 * Creates a Game from --seed, executes EndTurn --max-turns times, and prints
 * the per-turn hash chain plus the final hash as JSON on stdout. CI runs this
 * twice with the same seed and diffs the outputs (the determinism double-run).
 *
 * Usage: sim --seed 1 --max-turns 10
 */

import process from 'node:process';
import { Game } from '@civ8/engine';

/** Seeds are 32-bit: anything larger would silently alias mod 2^32. */
const MAX_SEED = 4294967295;
/** Sanity cap — a million turns is far beyond any legitimate M0 run. */
const MAX_TURNS = 1000000;

interface SimArgs {
  seed: number;
  maxTurns: number;
}

function parseArgs(argv: readonly string[]): SimArgs {
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
        fail(`missing value for ${arg}`);
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        fail(`${arg} must be a non-negative integer, got "${raw}"`);
      }
      if (arg === '--seed') {
        if (value > MAX_SEED) {
          fail(`--seed must be at most ${MAX_SEED} (2^32 - 1), got "${raw}"`);
        }
        seed = value;
      } else {
        if (value > MAX_TURNS) {
          fail(`--max-turns must be at most ${MAX_TURNS}, got "${raw}"`);
        }
        maxTurns = value;
      }
      i++;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: sim --seed <n> --max-turns <n>\n');
      process.exit(0);
    } else {
      fail(`unknown argument "${arg ?? ''}"`);
    }
  }
  return { seed, maxTurns };
}

function fail(message: string): never {
  process.stderr.write(`sim: ${message}\n`);
  process.exit(1);
}

function main(): void {
  const { seed, maxTurns } = parseArgs(process.argv.slice(2));
  const game = Game.create({ seed });
  const turnHashes: string[] = [];
  for (let i = 0; i < maxTurns; i++) {
    const result = game.execute({ type: 'EndTurn' });
    if (!result.ok) {
      fail(`turn ${i + 1} failed: ${result.error.code}: ${result.error.message}`);
    }
    turnHashes.push(game.hash());
  }
  const report = {
    seed,
    maxTurns,
    finalTurn: game.turn,
    turnHashes,
    finalHash: turnHashes[turnHashes.length - 1] ?? game.hash(),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
