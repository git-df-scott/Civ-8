import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_NAMES,
  END_TURN,
  EngineInvariantError,
  Game,
  SAVE_VERSION,
  SaveLoadError,
  runEndTurns,
  type Command,
} from '../src/index';
import { __setCommandHandlerForTests } from '../src/commands/registry';
import { hashState } from '../src/serialize/hash';

function hashChain(seed: number, turns: number): string[] {
  return runEndTurns(Game.create({ seed }), turns).turnHashes;
}

describe('Game', () => {
  it('two runs with the same seed produce identical hash chains', () => {
    expect(hashChain(1, 25)).toEqual(hashChain(1, 25));
  });

  it('different seeds produce different hash chains', () => {
    expect(hashChain(1, 10)).not.toEqual(hashChain(2, 10));
  });

  it('the hash evolves every EndTurn (RNG drift is real)', () => {
    const chain = hashChain(42, 15);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('EndTurn advances the active player; the turn increments on wrap', () => {
    const game = Game.create({ seed: 5 });
    const seats = DEFAULT_PLAYER_NAMES.length;
    expect(game.turn).toBe(0);
    expect(game.activePlayer).toBe(0);

    for (let seat = 0; seat < seats; seat++) {
      const result = game.execute(END_TURN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // TurnEnded.turn is the game turn DURING which the seat ended —
        // captured before the wrap increment, so every seat of round 0
        // reports turn 0 (including the last seat, whose EndTurn advances
        // the game to turn 1).
        expect(result.value).toEqual([{ type: 'TurnEnded', player: seat, turn: 0 }]);
      }
    }
    expect(game.turn).toBe(1);
    expect(game.activePlayer).toBe(0);

    // The first seat of round 1 reports turn 1.
    const nextRound = game.execute(END_TURN);
    expect(nextRound.ok).toBe(true);
    if (nextRound.ok) {
      expect(nextRound.value).toEqual([{ type: 'TurnEnded', player: 0, turn: 1 }]);
    }
  });

  it('records the command log and per-EndTurn hash chain', () => {
    const game = Game.create({ seed: 9 });
    const report = runEndTurns(game, 3);
    expect(game.log).toEqual([END_TURN, END_TURN, END_TURN]);
    expect(game.turnHashes).toEqual(report.turnHashes);
    expect(report.finalHash).toBe(game.hash());
  });

  it('rejects unknown commands with a RuleViolation (missing registry entry)', () => {
    const game = Game.create({ seed: 5 });
    const before = game.hash();
    const result = game.execute({ type: 'Nonsense' } as unknown as Command);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_COMMAND');
    }
    expect(game.hash()).toBe(before); // rejected commands must not mutate state
    expect(game.log).toHaveLength(0); // ...nor be logged
  });

  it('snapshot() is a detached plain-data save', () => {
    const game = Game.create({ seed: 3 });
    game.execute(END_TURN);
    const save = game.snapshot();
    expect(save.saveVersion).toBe(SAVE_VERSION);
    expect(save.seed).toBe(3);
    expect(save.commandLog).toEqual([END_TURN]);
    expect(save.turnHashes).toEqual([...game.turnHashes]);
    const hashBefore = game.hash();
    save.snapshot.turn = 999; // mutating the save must not touch the live game
    save.commandLog.push(END_TURN);
    expect(game.hash()).toBe(hashBefore);
    expect(game.log).toHaveLength(1);
  });

  it('load() restores a save byte-identically (fast path)', () => {
    const game = Game.create({ seed: 7 });
    runEndTurns(game, 5);
    const loaded = Game.load(game.snapshot());
    expect(loaded.hash()).toBe(game.hash());
    expect(loaded.turn).toBe(game.turn);
    expect(loaded.log).toEqual(game.log);
    expect(loaded.turnHashes).toEqual(game.turnHashes);
  });

  it('load() survives a JSON round-trip of the save', () => {
    const game = Game.create({ seed: 11 });
    runEndTurns(game, 4);
    const loaded = Game.load(JSON.parse(JSON.stringify(game.snapshot())));
    expect(loaded.hash()).toBe(game.hash());
  });

  it('replay() re-derives the same hash chain from seed + command log', () => {
    const game = Game.create({ seed: 13 });
    runEndTurns(game, 8);
    const save = game.snapshot();
    const replayed = Game.replay(save.seed, save.commandLog);
    expect(replayed.turnHashes).toEqual(save.turnHashes);
    expect(replayed.hash()).toBe(game.hash());
  });

  it('load() rejects a save from a newer engine with a clear error', () => {
    const save = Game.create({ seed: 1 }).snapshot();
    const tampered = { ...save, saveVersion: SAVE_VERSION + 1 };
    expect(() => Game.load(tampered)).toThrow(SaveLoadError);
    expect(() => Game.load(tampered)).toThrow(/newer engine/);
  });

  it('load() rejects structurally invalid saves with a clear path', () => {
    const save = JSON.parse(JSON.stringify(Game.create({ seed: 1 }).snapshot())) as {
      snapshot: { seed: unknown };
    };
    save.snapshot.seed = 'not-a-number';
    expect(() => Game.load(save)).toThrow(/save\.snapshot\.seed/);
  });

  it('hash() equals the hash of snapshot().snapshot (copy-free view is canonical)', () => {
    const game = Game.create({ seed: 21 });
    runEndTurns(game, 6);
    // hash() uses the allocation-light toCanonicalView path; snapshot() uses
    // the deep-copying serializeGameState path. Both must hash identically.
    expect(game.hash()).toBe(hashState(game.snapshot().snapshot));
  });

  it('a throwing apply() poisons the instance: execute/hash/snapshot all fail fast', () => {
    __setCommandHandlerForTests('EndTurn', {
      validate: () => null,
      apply: (state) => {
        state.turn += 7; // mutate BEFORE throwing: live state is now advanced...
        throw new Error('boom mid-mutation');
      },
    });
    try {
      const game = Game.create({ seed: 17 });
      // ...but the command never reaches the log — silent live/replay
      // divergence unless the engine fails fast.
      let thrown: unknown;
      try {
        game.execute(END_TURN);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(EngineInvariantError);
      expect((thrown as Error).message).toMatch(/poisoned/);
      expect((thrown as Error & { cause?: Error }).cause?.message).toBe('boom mid-mutation');

      // Every subsequent use of the poisoned instance throws the same error.
      expect(() => game.execute(END_TURN)).toThrow(EngineInvariantError);
      expect(() => game.hash()).toThrow(/poisoned/);
      expect(() => game.snapshot()).toThrow(/poisoned/);
      expect(game.log).toHaveLength(0); // the throwing command was never logged
    } finally {
      __setCommandHandlerForTests('EndTurn', undefined);
    }
  });

  it('a healthy instance is not poisoned by rejected or successful commands', () => {
    const game = Game.create({ seed: 17 });
    game.execute({ type: 'Nonsense' } as unknown as Command); // rejected, not poisoned
    const result = game.execute(END_TURN);
    expect(result.ok).toBe(true);
    expect(() => game.hash()).not.toThrow();
    expect(() => game.snapshot()).not.toThrow();
  });
});
