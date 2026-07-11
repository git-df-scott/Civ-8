/**
 * bench — performance baselines (doc 04 §7, tracked from M2). Reports mapgen
 * time per size and full-map save-serialize / state-hash time as JSON on
 * stdout. Budgets (huge mapgen < 3s, save serialize < 500ms) are recorded in
 * the output and reflected in the exit code so CI can gate on them later.
 *
 * Wall-clock timing is fine here: the CLI is not the engine — determinism
 * rules ban clocks in packages/engine and packages/ai only.
 *
 * Usage: bench [--seed <n>]
 */

import process from 'node:process';
import { Game, GameRng, generateMap, MAP_SIZE_NAMES, type MapSizeName } from '@civ8/engine';

const BUDGET_HUGE_MAPGEN_MS = 3000;
const BUDGET_SAVE_SERIALIZE_MS = 500;

/** Median wall-clock ms of `runs` executions of fn. */
function timeMs(runs: number, fn: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return Math.round((samples[samples.length >> 1] as number) * 100) / 100;
}

function main(): void {
  const seedArgAt = process.argv.indexOf('--seed');
  const seed = seedArgAt === -1 ? 7 : Number(process.argv[seedArgAt + 1]);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    process.stderr.write('bench: --seed must be an integer in [0, 2^32)\n');
    process.exit(1);
  }

  // Warm up JIT so the first measured size is not penalized.
  generateMap(new GameRng(seed), 'duel');

  const mapgenMs: Partial<Record<MapSizeName, number>> = {};
  for (const size of MAP_SIZE_NAMES) {
    mapgenMs[size] = timeMs(3, () => {
      generateMap(new GameRng(seed), size);
    });
  }

  // Save-path timings on a full huge-map game.
  const game = Game.create({ seed, mapSize: 'huge' });
  const saveSerializeMs = timeMs(5, () => {
    game.snapshot();
  });
  const stateHashMs = timeMs(5, () => {
    game.hash();
  });
  const save = game.snapshot();
  const saveJsonMs = timeMs(5, () => {
    JSON.stringify(save);
  });

  const withinBudgets =
    (mapgenMs.huge as number) < BUDGET_HUGE_MAPGEN_MS && saveSerializeMs < BUDGET_SAVE_SERIALIZE_MS;

  const report = {
    seed,
    mapgenMs,
    saveSerializeMs,
    saveJsonMs,
    stateHashMs,
    budgets: {
      hugeMapgenMs: BUDGET_HUGE_MAPGEN_MS,
      saveSerializeMs: BUDGET_SAVE_SERIALIZE_MS,
    },
    withinBudgets,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!withinBudgets) {
    process.exitCode = 1;
  }
}

main();
