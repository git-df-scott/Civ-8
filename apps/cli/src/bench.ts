/**
 * bench — mapgen and full-map save benchmarks (doc 04 §7, tracked from M2).
 *
 * Reports, as JSON on stdout:
 *   - mapgen time per map size (median of `runs`)
 *   - full-map save serialization (Game.snapshot), canonical hash, and
 *     load+validate time on a huge map
 * and exits nonzero when a doc 04 §7 budget is exceeded (huge mapgen < 3s,
 * save serialize < 500ms, load+validate < 2s) so regressions die young.
 *
 * Wall-clock timing is fine HERE: the CLI is not the engine; nothing here
 * feeds game state.
 *
 * Usage: bench [--runs <n>]   (default 5)
 */

import process from 'node:process';
import {
  Game,
  MAP_SIZES,
  MAP_SIZE_NAMES,
  canonicalStringify,
  generateMapForSeed,
  hashState,
  type MapSizeName,
} from '@civ8/engine';

const BENCH_SEED = 7;

const BUDGETS_MS = {
  hugeMapgen: 3000,
  hugeSaveSerialize: 500,
  hugeLoadValidate: 2000,
} as const;

function parseRuns(argv: readonly string[]): number {
  let runs = 5;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    if (arg === '--runs') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        process.stderr.write(`bench: --runs must be an integer in [1, 100]\n`);
        process.exit(1);
      }
      runs = value;
      i++;
    } else {
      process.stderr.write(`bench: unknown argument "${arg ?? ''}"\n`);
      process.exit(1);
    }
  }
  return runs;
}

/** Median wall-clock ms over `runs` invocations (first call included — cold
 * costs are real costs, and the median absorbs the outlier). */
function medianMs(runs: number, fn: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return Math.round((samples[Math.floor(samples.length / 2)] as number) * 100) / 100;
}

function main(): void {
  const runs = parseRuns(process.argv.slice(2));

  const mapgenMs: Partial<Record<MapSizeName, number>> = {};
  for (const size of MAP_SIZE_NAMES) {
    mapgenMs[size] = medianMs(runs, () => {
      generateMapForSeed(BENCH_SEED, size);
    });
  }

  // Full-game save path on a huge map.
  const game = Game.create({ seed: BENCH_SEED, mapSize: 'huge' });
  let saveJson = '';
  const serializeMs = medianMs(runs, () => {
    saveJson = JSON.stringify(game.snapshot());
  });
  const hashMs = medianMs(runs, () => {
    game.hash();
  });
  const loadValidateMs = medianMs(runs, () => {
    Game.load(JSON.parse(saveJson));
  });

  const report = {
    seed: BENCH_SEED,
    runs,
    sizes: Object.fromEntries(
      MAP_SIZE_NAMES.map((s) => [s, `${MAP_SIZES[s].width}x${MAP_SIZES[s].height}`]),
    ),
    mapgenMs,
    huge: {
      saveSerializeMs: serializeMs,
      saveJsonBytes: saveJson.length,
      stateHashMs: hashMs,
      loadValidateMs,
      canonicalBytes: canonicalStringify(game.snapshot().snapshot).length,
      stateHash: hashState(game.snapshot().snapshot),
    },
    budgetsMs: BUDGETS_MS,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const failures: string[] = [];
  if ((mapgenMs.huge as number) >= BUDGETS_MS.hugeMapgen) {
    failures.push(`huge mapgen ${mapgenMs.huge}ms >= budget ${BUDGETS_MS.hugeMapgen}ms`);
  }
  if (serializeMs >= BUDGETS_MS.hugeSaveSerialize) {
    failures.push(`save serialize ${serializeMs}ms >= budget ${BUDGETS_MS.hugeSaveSerialize}ms`);
  }
  if (loadValidateMs >= BUDGETS_MS.hugeLoadValidate) {
    failures.push(`load+validate ${loadValidateMs}ms >= budget ${BUDGETS_MS.hugeLoadValidate}ms`);
  }
  if (failures.length > 0) {
    process.stderr.write(`bench: BUDGET EXCEEDED\n  ${failures.join('\n  ')}\n`);
    process.exit(1);
  }
}

main();
