import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Game, SAVE_VERSION, runEndTurns } from '../src/index';
import { migrations } from '../src/serialize/migrations/index';

/**
 * Golden saves: one REAL save file per historical saveVersion (doc 04 §3.4),
 * captured by the engine that wrote that version and never regenerated.
 * Every file must keep loading through the migration chain forever.
 */
const GOLDEN_SAVES_DIR = fileURLToPath(
  new URL('../../../test-fixtures/golden-saves/', import.meta.url),
);

const files = readdirSync(GOLDEN_SAVES_DIR).filter((f) => f.endsWith('.json'));

interface RawGolden {
  saveVersion: number;
  seed: number;
  turnHashes: string[];
  commandLog: unknown[];
}

describe('golden saves (one per historical saveVersion)', () => {
  it('there is a migration chain entry for every version below SAVE_VERSION', () => {
    expect(migrations).toHaveLength(SAVE_VERSION);
  });

  it('every historical saveVersion below the current one has a golden save', () => {
    const versions = files
      .map(
        (f) =>
          (JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, f), 'utf8')) as RawGolden).saveVersion,
      )
      .sort((a, b) => a - b);
    for (let v = 0; v < SAVE_VERSION; v++) {
      expect(versions, `missing golden save for saveVersion ${v}`).toContain(v);
    }
  });

  it.each(files)('%s loads via the migration chain and replays (AC5)', (file) => {
    const raw = JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, file), 'utf8')) as RawGolden;
    expect(raw.saveVersion).toBeLessThan(SAVE_VERSION);

    // 1. The fast path: migrate + validate + restore.
    const loaded = Game.load(raw);

    // 2. The recorded log and hash chain survive the migration untouched
    //    (old turnHashes are version-N forensics history).
    expect(loaded.log).toHaveLength(raw.commandLog.length);
    expect([...loaded.turnHashes]).toEqual(raw.turnHashes);

    // 3. The verification path: replaying the migrated save's command log
    //    from its seed on the CURRENT engine must land on the exact state
    //    the migration produced. This is the strongest possible migration
    //    correctness statement: migrate(v0 save) ≡ replay(v1 engine).
    //    (It holds because mapgen only touched fresh `mapgen:*` substreams —
    //    substream isolation — and the migration regenerates the map exactly
    //    as Game.create would have.)
    const replayed = Game.replay(raw.seed, loaded.log);
    expect(loaded.hash()).toBe(replayed.hash());

    // 4. Both continue identically: the loaded game is fully live.
    const a = runEndTurns(loaded, 4);
    const b = runEndTurns(replayed, 4);
    expect(a.turnHashes).toEqual(b.turnHashes);
  });

  it('a v0 save whose snapshot.map is not null is rejected by the migration', () => {
    const file = files[0]!;
    const raw = JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, file), 'utf8')) as {
      snapshot: { map: unknown };
    };
    raw.snapshot.map = { width: 3, height: 3 };
    expect(() => Game.load(raw)).toThrow(/v0 saves have no map/);
  });

  it(
    "a stray 'mapgen:*' RNG key in a v0 save's snapshot.rng cannot override the " +
      'freshly-computed mapgen substream (regression)',
    () => {
      const file = files[0]!;
      const raw = JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, file), 'utf8')) as {
        seed: number;
        snapshot: { rng: Record<string, unknown> };
      };
      // A 'mapgen:*' key is definitionally corrupt/hostile on a v0 save — v0
      // predates mapgen entirely, so no genuine v0 save ever contains one.
      // Give it a validly-shaped but numerically WRONG Pcg32 state (a copy of
      // the unrelated 'turn' stream's state) so a merge-precedence bug that
      // lets old data win would leak wrong values into v1's mapgen:landmass
      // substream — exactly the divergence this regression test targets.
      raw.snapshot.rng['mapgen:landmass'] = { ...(raw.snapshot.rng['turn'] as object) };

      const loaded = Game.load(raw);
      const replayed = Game.replay(raw.seed, loaded.log);
      // If the stray key had won, loaded.state.rng['mapgen:landmass'] would
      // hold the wrong (copied-from-'turn') values while a fresh replay
      // recomputes the correct ones — hashes would diverge immediately, with
      // no further turns needed to expose it.
      expect(loaded.hash()).toBe(replayed.hash());
    },
  );
});
