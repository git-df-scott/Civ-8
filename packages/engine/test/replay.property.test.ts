import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Game, runEndTurns } from '../src/index';

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
const turnsArb = fc.integer({ min: 0, max: 50 });
// Since M2 every Game.create runs full mapgen, so property tests use the
// smallest (duel) map to keep 500-run suites fast. Determinism has no
// size-dependent code paths; the sizes share every line of pipeline code.
const MAP_SIZE = 'duel' as const;

describe('replay identity (property)', () => {
  it('two fresh runs of (seed, N EndTurns) produce identical hash chains [500 runs]', () => {
    fc.assert(
      fc.property(seedArb, turnsArb, (seed, turns) => {
        const first = runEndTurns(Game.create({ seed, mapSize: MAP_SIZE }), turns);
        const second = runEndTurns(Game.create({ seed, mapSize: MAP_SIZE }), turns);
        expect(second.turnHashes).toEqual(first.turnHashes);
        expect(second.finalHash).toBe(first.finalHash);
      }),
      { numRuns: 500 },
    );
  }, 120_000);

  it('Game.replay(seed, commandLog) reproduces the recorded hash chain [500 runs]', () => {
    fc.assert(
      fc.property(seedArb, turnsArb, (seed, turns) => {
        const game = Game.create({ seed, mapSize: MAP_SIZE });
        runEndTurns(game, turns);
        const save = game.snapshot();
        const replayed = Game.replay(save.seed, save.commandLog, { mapSize: MAP_SIZE });
        expect(replayed.turnHashes).toEqual(save.turnHashes);
        expect(replayed.hash()).toBe(game.hash());
      }),
      { numRuns: 500 },
    );
  }, 120_000);
});
