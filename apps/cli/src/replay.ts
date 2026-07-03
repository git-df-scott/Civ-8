/**
 * replay — verifies a golden-log fixture file: replays its command log from
 * its seed and asserts the recorded hash chain (doc 04 §3.4 verification
 * path). Exit 0 on match; exit 1 with a clear message on any mismatch.
 *
 * Usage: replay <fixture.json>
 *   e.g. pnpm --filter @civ8/cli run replay test-fixtures/golden-logs/seed-1-endturns-10.json
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseFixture, verifyFixture } from './goldenLogs';

function fail(message: string): never {
  process.stderr.write(`replay: ${message}\n`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const target = args[0];
  if (target === undefined || args.length !== 1) {
    fail('usage: replay <fixture.json>');
  }
  // pnpm runs package scripts with cwd = the package dir; INIT_CWD is where
  // the user actually invoked pnpm, so root-relative fixture paths work.
  const path = resolve(process.env['INIT_CWD'] ?? process.cwd(), target);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read fixture ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let fixture;
  try {
    fixture = parseFixture(raw, path);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const result = verifyFixture(fixture);
  if (!result.ok) {
    fail(
      `FAILED — ${fixture.description} (${path})\n` +
        `replay: ${result.message}\n` +
        `replay: the engine no longer reproduces this recorded run. If the hash change is\n` +
        `replay: intentional, regenerate fixtures with \`pnpm goldens:update\` and explain\n` +
        `replay: the change in the commit; otherwise determinism has regressed.`,
    );
  }
  process.stdout.write(
    `replay: OK — ${fixture.description}: ${fixture.commandLog.length} commands, ` +
      `${fixture.expectedTurnHashes.length} turn hashes match (final ${result.finalHash})\n`,
  );
}

main();
