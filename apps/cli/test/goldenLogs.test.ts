import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_LOGS_DIR,
  GOLDEN_RUNS,
  fixtureFinalHash,
  parseFixture,
  verifyFixture,
} from '../src/goldenLogs';

const files = readdirSync(GOLDEN_LOGS_DIR).filter((f) => f.endsWith('.json'));

describe('golden logs', () => {
  it('every registered golden run has a committed fixture (and vice versa)', () => {
    expect(files.sort()).toEqual(GOLDEN_RUNS.map((run) => run.file).sort());
  });

  it.each(files)('%s replays to its recorded hash chain', (file) => {
    const path = join(GOLDEN_LOGS_DIR, file);
    const fixture = parseFixture(JSON.parse(readFileSync(path, 'utf8')), path);
    const result = verifyFixture(fixture);
    expect(result).toEqual({ ok: true, finalHash: fixtureFinalHash(fixture) });
  });

  it('parseFixture rejects a fixture with a bad hex hash (engine-strict validation)', () => {
    const file = GOLDEN_RUNS[0]?.file as string;
    const path = join(GOLDEN_LOGS_DIR, file);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { expectedTurnHashes: string[] };
    raw.expectedTurnHashes[0] = 'NOT-HEX';
    expect(() => parseFixture(raw, path)).toThrow(/16-char lowercase hex hash/);
  });

  it('parseFixture rejects a fixture with an unknown command type', () => {
    const file = GOLDEN_RUNS[0]?.file as string;
    const path = join(GOLDEN_LOGS_DIR, file);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { commandLog: unknown[] };
    raw.commandLog[0] = { type: 'Nonsense' };
    expect(() => parseFixture(raw, path)).toThrow(/known command type/);
  });

  it('verifyFixture reports a tampered expected hash as a mismatch', () => {
    const file = GOLDEN_RUNS[0]?.file as string;
    const path = join(GOLDEN_LOGS_DIR, file);
    const fixture = parseFixture(JSON.parse(readFileSync(path, 'utf8')), path);
    const tampered = {
      ...fixture,
      expectedTurnHashes: fixture.expectedTurnHashes.map((h, i) =>
        i === 0 ? '0000000000000000' : h,
      ),
    };
    const result = verifyFixture(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('turn hash 0 mismatch');
    }
  });
});
