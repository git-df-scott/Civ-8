/**
 * goldens-update — regenerates every golden-log fixture in
 * test-fixtures/golden-logs/ from the current engine.
 *
 * Run via `pnpm goldens:update` (repo root) ONLY when a hash change is
 * intentional and understood (see docs/determinism.md). Review the resulting
 * diff — every changed hash must have an explanation.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { GOLDEN_LOGS_DIR, GOLDEN_RUNS, fixtureFinalHash, generateFixture } from './goldenLogs';

mkdirSync(GOLDEN_LOGS_DIR, { recursive: true });
for (const { file, seed, endTurns } of GOLDEN_RUNS) {
  const fixture = generateFixture(seed, endTurns);
  const path = join(GOLDEN_LOGS_DIR, file);
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
  process.stdout.write(`wrote ${path} (final hash ${fixtureFinalHash(fixture)})\n`);
}
