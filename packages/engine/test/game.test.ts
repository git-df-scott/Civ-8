import { describe, expect, it } from 'vitest';
import { Game, SAVE_VERSION, type Command } from '../src/index';

const END_TURN: Command = { type: 'EndTurn' };

function hashChain(seed: number, turns: number): string[] {
  const game = Game.create({ seed });
  const hashes: string[] = [];
  for (let i = 0; i < turns; i++) {
    const result = game.execute(END_TURN);
    expect(result.ok).toBe(true);
    hashes.push(game.hash());
  }
  return hashes;
}

describe('Game', () => {
  it('two runs with the same seed produce identical hash chains', () => {
    expect(hashChain(1, 25)).toEqual(hashChain(1, 25));
  });

  it('different seeds produce different hash chains', () => {
    expect(hashChain(1, 10)).not.toEqual(hashChain(2, 10));
  });

  it('the hash evolves every turn (RNG drift is real)', () => {
    const chain = hashChain(42, 15);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('EndTurn advances the turn counter and emits TurnEnded', () => {
    const game = Game.create({ seed: 5 });
    expect(game.turn).toBe(0);
    const result = game.execute(END_TURN);
    expect(result).toEqual({ ok: true, value: [{ type: 'TurnEnded', turn: 1 }] });
    expect(game.turn).toBe(1);
  });

  it('rejects unknown commands with a RuleViolation', () => {
    const game = Game.create({ seed: 5 });
    const before = game.hash();
    const result = game.execute({ type: 'Nonsense' } as unknown as Command);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_COMMAND');
    }
    expect(game.hash()).toBe(before); // rejected commands must not mutate state
  });

  it('snapshot() is a detached plain-data save', () => {
    const game = Game.create({ seed: 3 });
    game.execute(END_TURN);
    const save = game.snapshot();
    expect(save.saveVersion).toBe(SAVE_VERSION);
    expect(save.seed).toBe(3);
    expect(save.snapshot.turn).toBe(1);
    const hashBefore = game.hash();
    save.snapshot.turn = 999; // mutating the save must not touch the live game
    expect(game.hash()).toBe(hashBefore);
  });
});
