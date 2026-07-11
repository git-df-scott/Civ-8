import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Game, runEndTurns } from '../src/index';

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
// M2 note: creates run full duel mapgen and saves now carry the map, so runs
// are costlier than in M1 — fewer turns per run, explicit timeout, same
// 250-seed coverage.
const turnsArb = fc.integer({ min: 0, max: 12 });

describe('save/load transparency (property)', () => {
  it('N EndTurns, snapshot, load, M more on both: original and loaded stay identical [250 runs]', () => {
    fc.assert(
      fc.property(seedArb, turnsArb, turnsArb, (seed, before, after) => {
        const original = Game.create({ seed });
        runEndTurns(original, before);

        // Round-trip through JSON: exactly what a real on-disk save sees.
        const loaded = Game.load(JSON.parse(JSON.stringify(original.snapshot())));
        expect(loaded.hash()).toBe(original.hash());

        const originalRun = runEndTurns(original, after);
        const loadedRun = runEndTurns(loaded, after);
        expect(loadedRun.turnHashes).toEqual(originalRun.turnHashes);
        expect(loaded.hash()).toBe(original.hash());
        expect(loaded.turnHashes).toEqual(original.turnHashes);
        expect(loaded.log).toEqual(original.log);
      }),
      { numRuns: 250 },
    );
  }, 120_000);
});
