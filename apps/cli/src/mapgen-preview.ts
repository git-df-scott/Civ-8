/**
 * mapgen-preview — seed + size → PNG, for eyeballing maps locally and in CI
 * (doc 04 §2). Prints the output path and the FNV-1a 64 hash of the PNG
 * bytes (same seed+size ⇒ byte-identical file, so the hash is a determinism
 * receipt).
 *
 * Usage: mapgen-preview --seed 7 --size huge --out map.png
 *   via the root script: pnpm mapgen -- --seed 7 --size huge --out map.png
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  DEFAULT_MAP_SIZE,
  MAP_SIZE_NAMES,
  fnv1a64HexBytes,
  isMapSizeName,
  type MapSizeName,
} from '@civ8/engine';
import { renderMapPngBuffer } from './mapgenPreview';
import { MAX_SEED } from './simArgs';

interface PreviewArgs {
  seed: number;
  size: MapSizeName;
  out: string;
}

function fail(message: string): never {
  process.stderr.write(`mapgen-preview: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): PreviewArgs {
  let seed = 7;
  let size: MapSizeName = DEFAULT_MAP_SIZE;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      continue; // pnpm forwards the literal "--" separator
    }
    if (arg === '--seed' || arg === '--size' || arg === '--out') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        fail(`missing value for ${arg}`);
      }
      if (arg === '--seed') {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0 || value > MAX_SEED) {
          fail(`--seed must be an integer in [0, ${MAX_SEED}], got "${raw}"`);
        }
        seed = value;
      } else if (arg === '--size') {
        if (!isMapSizeName(raw)) {
          fail(`--size must be one of ${MAP_SIZE_NAMES.join(', ')}, got "${raw}"`);
        }
        size = raw;
      } else {
        out = raw;
      }
      i++;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        `Usage: mapgen-preview --seed <n> --size <${MAP_SIZE_NAMES.join('|')}> --out <file.png>\n`,
      );
      process.exit(0);
    } else {
      fail(`unknown argument "${arg ?? ''}"`);
    }
  }
  return { seed, size, out: out ?? `map-seed${seed}-${size}.png` };
}

function main(): void {
  const { seed, size, out } = parseArgs(process.argv.slice(2));
  const buffer = renderMapPngBuffer(seed, size);
  // pnpm runs package scripts with cwd = the package dir; INIT_CWD is where
  // the user actually invoked pnpm, so root-relative --out paths work.
  const path = resolve(process.env['INIT_CWD'] ?? process.cwd(), out);
  writeFileSync(path, buffer);
  process.stdout.write(
    `mapgen-preview: seed ${seed} size ${size} → ${path}\n` +
      `mapgen-preview: png bytes ${buffer.length}, fnv1a64 ${fnv1a64HexBytes(buffer)}\n`,
  );
}

main();
