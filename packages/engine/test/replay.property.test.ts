import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Game, runEndTurns } from '../src/index';

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
// Since M2 every Game.create runs full duel mapgen and every EndTurn hashes
// the map, so a run is ~20× costlier than in M1. The determinism signal is
// per-run (seed coverage), not per-turn: fewer turns, explicit timeouts,
// same 500-seed coverage. These runs also fuzz mapgen's validation stage
// across 500 random seeds for free.
const turnsArb = fc.integer({ min: 0, max: 20 });

describe('replay identity (property)', () => {
  it('two fresh runs of (seed, N EndTurns) produce identical hash chains [500 runs]', () => {
    fc.assert(
      fc.property(seedArb, turnsArb, (seed, turns) => {
        const first = runEndTurns(Game.create({ seed }), turns);
        const second = runEndTurns(Game.create({ seed }), turns);
        expect(second.turnHashes).toEqual(first.turnHashes);
        expect(second.finalHash).toBe(first.finalHash);
      }),
      { numRuns: 500 },
    );
  }, 120_000);

  it('Game.replay(seed, commandLog) reproduces the recorded hash chain [500 runs]', () => {
    fc.assert(
      fc.property(seedArb, turnsArb, (seed, turns) => {
        const game = Game.create({ seed });
        runEndTurns(game, turns);
        const save = game.snapshot();
        const replayed = Game.replay(save.seed, save.commandLog);
        expect(replayed.turnHashes).toEqual(save.turnHashes);
        expect(replayed.hash()).toBe(game.hash());
      }),
      { numRuns: 500 },
    );
  }, 120_000);
});
