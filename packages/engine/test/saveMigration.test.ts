import { describe, expect, it } from 'vitest';
import { Game, runEndTurns, SAVE_VERSION, SaveLoadError } from '../src/index';
import { sortedKeys } from '../src/serialize/canonical';
import type { Pcg32State } from '../src/rng/pcg32';

/**
 * Builds a REAL v0 save shape from a live v1 game: v0 (M1) had no map, no
 * mapSize, and no mapgen rng streams. The committed on-disk v0 golden save
 * (test-fixtures/golden-saves/) is covered by apps/cli/test — this test
 * proves the migration logic itself without filesystem access (engine tests
 * are pure).
 */
function asV0Save(game: Game): Record<string, unknown> {
  const save = JSON.parse(JSON.stringify(game.snapshot())) as {
    saveVersion: number;
    snapshot: {
      map: unknown;
      mapSize?: unknown;
      rng: Record<string, Pcg32State>;
    };
  };
  save.saveVersion = 0;
  save.snapshot.map = null;
  delete save.snapshot.mapSize;
  const strippedRng: Record<string, Pcg32State> = {};
  for (const name of sortedKeys(save.snapshot.rng)) {
    if (!name.startsWith('mapgen:')) {
      strippedRng[name] = save.snapshot.rng[name] as Pcg32State;
    }
  }
  save.snapshot.rng = strippedRng;
  return save as unknown as Record<string, unknown>;
}

describe('save migration v0 → v1', () => {
  it('a v0 save loads via the migration and reconstructs the exact v1 state', () => {
    const original = Game.create({ seed: 3 }); // duel — the v0 default
    runEndTurns(original, 8);
    const v0 = asV0Save(original);
    expect(v0['saveVersion']).toBe(0);

    const loaded = Game.load(v0);
    // The migration regenerates the map from the seed and merges the mapgen
    // rng streams — byte-for-byte the live v1 game's state.
    expect(loaded.hash()).toBe(original.hash());
    expect(loaded.turn).toBe(original.turn);
    expect(loaded.mapSize).toBe('duel');
  });

  it('a migrated v0 game replays: its command log re-derives the same state', () => {
    const original = Game.create({ seed: 5 });
    runEndTurns(original, 6);
    const loaded = Game.load(asV0Save(original));
    const replayed = Game.replay(5, loaded.log);
    expect(replayed.hash()).toBe(loaded.hash());
    expect(replayed.turnHashes).toEqual([...loaded.turnHashes]);
  });

  it('a migrated v0 game continues identically to the live game', () => {
    const original = Game.create({ seed: 9 });
    runEndTurns(original, 4);
    const loaded = Game.load(asV0Save(original));
    const originalRun = runEndTurns(original, 5);
    const loadedRun = runEndTurns(loaded, 5);
    expect(loadedRun.turnHashes).toEqual(originalRun.turnHashes);
  });

  it('still rejects saves newer than the engine', () => {
    const save = Game.create({ seed: 1 }).snapshot();
    expect(() => Game.load({ ...save, saveVersion: SAVE_VERSION + 1 })).toThrow(SaveLoadError);
  });

  it('a current save round-trips without touching the migration chain', () => {
    const game = Game.create({ seed: 4 });
    runEndTurns(game, 3);
    const save = game.snapshot();
    expect(save.saveVersion).toBe(1);
    expect(Game.load(JSON.parse(JSON.stringify(save))).hash()).toBe(game.hash());
  });

  it('rejects a v1 save with a corrupted map payload', () => {
    const raw = JSON.parse(JSON.stringify(Game.create({ seed: 2 }).snapshot())) as {
      snapshot: { map: { terrain: string } };
    };
    raw.snapshot.map.terrain = 'not base64!';
    expect(() => Game.load(raw)).toThrow(SaveLoadError);
    expect(() => Game.load(raw)).toThrow(/base64/);
  });
});
