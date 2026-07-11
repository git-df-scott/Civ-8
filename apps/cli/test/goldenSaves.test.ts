/**
 * Golden-save fixtures (doc 04 §3.4): one REAL save per historical
 * saveVersion, committed the moment the version is superseded. CI asserts
 * every one still loads through the migration chain and that its command log
 * still re-derives the identical end state — the save-compatibility contract.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Game, runEndTurns, SAVE_VERSION } from '@civ8/engine';

const GOLDEN_SAVES_DIR = fileURLToPath(
  new URL('../../../test-fixtures/golden-saves/', import.meta.url),
);

const files = readdirSync(GOLDEN_SAVES_DIR).filter((f) => f.endsWith('.json'));

describe('golden saves', () => {
  it('there is at least one golden save per superseded save version', () => {
    const versions = files.map(
      (f) =>
        (JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, f), 'utf8')) as { saveVersion: number })
          .saveVersion,
    );
    for (let v = 0; v < SAVE_VERSION; v++) {
      expect(versions, `missing a golden save for saveVersion ${v}`).toContain(v);
    }
  });

  it.each(files)('%s loads via the migration chain and replays', (file) => {
    const raw = JSON.parse(readFileSync(join(GOLDEN_SAVES_DIR, file), 'utf8')) as {
      saveVersion: number;
      seed: number;
    };
    expect(raw.saveVersion).toBeLessThanOrEqual(SAVE_VERSION);

    // Load path: migrate + validate + restore.
    const loaded = Game.load(raw);

    // Replay path: the migrated game's command log re-derives the same state
    // under the current engine (the v0→v1 migration reconstructs exactly what
    // a v1 create-and-replay produces).
    const replayed = Game.replay(raw.seed, loaded.log, { mapSize: loaded.mapSize });
    expect(replayed.hash()).toBe(loaded.hash());

    // And the loaded game is fully playable: it continues deterministically.
    const a = runEndTurns(loaded, 3);
    const b = runEndTurns(replayed, 3);
    expect(a.turnHashes).toEqual(b.turnHashes);
  });
});
