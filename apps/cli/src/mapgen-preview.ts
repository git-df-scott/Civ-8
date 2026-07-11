/**
 * mapgen-preview — seed + size → PNG, for eyeballing maps in CI and review
 * (doc 04 §2). pngjs lives HERE, never in the engine. Rendering is pure
 * (renderMapPng is unit-tested for byte-identical output on equal seeds):
 * offset tile blocks approximate the hex layout, rivers draw on their edge
 * segments, relief shades elevation, features and resources overlay.
 *
 * Usage: mapgen-preview --seed 7 --size huge --out map.png
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { PNG } from 'pngjs';
import {
  computeDiagnostics,
  FEATURE,
  GameRng,
  generateMap,
  isMapSizeName,
  MAP_SIZE_NAMES,
  reliefOf,
  RELIEF,
  TERRAIN,
  type MapSizeName,
  type MapState,
} from '@civ8/engine';

/** Tile block size: PX wide, RH tall; odd rows shift right by PX/2. */
const PX = 8;
const RH = 7;

/** [r, g, b] per terrain id (indexed by TERRAIN values). */
const TERRAIN_COLORS: readonly (readonly [number, number, number])[] = [
  [18, 44, 84], // ocean
  [38, 84, 138], // coast
  [52, 118, 176], // lake
  [78, 138, 60], // grassland
  [150, 148, 68], // plains
  [212, 185, 116], // desert
  [140, 148, 128], // tundra
  [230, 236, 240], // snow
];

const FEATURE_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], // none (unused)
  [30, 72, 32], // forest
  [18, 88, 24], // jungle
  [58, 104, 92], // marsh
];

const RESOURCE_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], // none (unused)
  [176, 176, 192], // iron
  [217, 160, 102], // horses
  [255, 224, 102], // wheat
  [200, 200, 200], // stone
  [154, 209, 255], // fish
  [255, 215, 0], // gold
];

const RIVER_COLOR: readonly [number, number, number] = [64, 160, 255];
const MOUNTAIN_COLOR: readonly [number, number, number] = [104, 96, 88];

export interface PreviewArgs {
  readonly seed: number;
  readonly size: MapSizeName;
  readonly out: string;
}

export function parsePreviewArgs(argv: readonly string[]): PreviewArgs {
  let seed = 7;
  let size: MapSizeName = 'standard';
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    if (arg === '--seed' || arg === '--size' || arg === '--out') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        throw new Error(`missing value for ${arg}`);
      }
      if (arg === '--seed') {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
          throw new Error(`--seed must be an integer in [0, 2^32), got "${raw}"`);
        }
        seed = value;
      } else if (arg === '--size') {
        if (!isMapSizeName(raw)) {
          throw new Error(`--size must be one of ${MAP_SIZE_NAMES.join(', ')}, got "${raw}"`);
        }
        size = raw;
      } else {
        out = raw;
      }
      i++;
    } else {
      throw new Error(`unknown argument "${arg ?? ''}"`);
    }
  }
  if (out === '') {
    out = `map-seed${seed}-${size}.png`;
  }
  return { seed, size, out };
}

/** Blends `color` over the pixel at (x, y) with alpha/255 opacity. */
function blend(
  png: PNG,
  x: number,
  y: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }
  const idx = (png.width * y + x) * 4;
  const data = png.data;
  data[idx] = Math.round(((data[idx] as number) * (255 - alpha) + color[0] * alpha) / 255);
  data[idx + 1] = Math.round(((data[idx + 1] as number) * (255 - alpha) + color[1] * alpha) / 255);
  data[idx + 2] = Math.round(((data[idx + 2] as number) * (255 - alpha) + color[2] * alpha) / 255);
  data[idx + 3] = 255;
}

function fillRect(
  png: PNG,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: readonly [number, number, number],
  alpha = 255,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      blend(png, x, y, color, alpha);
    }
  }
}

/** Renders a MapState to a PNG buffer. Pure: equal maps ⇒ identical bytes. */
export function renderMapPng(map: MapState): Buffer {
  const png = new PNG({
    width: map.width * PX + PX / 2,
    height: map.height * RH,
    colorType: 6,
  });
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const i = row * map.width + col;
      const x0 = col * PX + (row & 1) * (PX / 2);
      const y0 = row * RH;
      const terr = map.terrain[i] as number;
      const elev = map.elevation[i] as number;
      const relief = reliefOf(elev);
      let color = TERRAIN_COLORS[terr] as readonly [number, number, number];
      if (relief === RELIEF.MOUNTAIN) {
        color = MOUNTAIN_COLOR;
      }
      fillRect(png, x0, y0, PX, RH, color);
      if (terr === TERRAIN.OCEAN || terr === TERRAIN.COAST) {
        // Slight depth shading so coastlines read.
        fillRect(png, x0, y0, PX, RH, [0, 0, 0], terr === TERRAIN.OCEAN ? 40 : 0);
      }
      if (relief === RELIEF.HILLS) {
        fillRect(png, x0 + 1, y0 + 1, PX - 2, RH - 2, [0, 0, 0], 45);
      }
      if (relief === RELIEF.MOUNTAIN && elev >= 240) {
        fillRect(png, x0 + 3, y0 + 2, 2, 2, [245, 245, 245]); // snow cap
      }
      const feat = map.feature[i] as number;
      if (feat !== FEATURE.NONE) {
        fillRect(
          png,
          x0 + 2,
          y0 + 2,
          PX - 4,
          RH - 4,
          FEATURE_COLORS[feat] as readonly [number, number, number],
          170,
        );
      }
      const res = map.resource[i] as number;
      if (res !== 0) {
        fillRect(
          png,
          x0 + 3,
          y0 + 3,
          2,
          2,
          RESOURCE_COLORS[res] as readonly [number, number, number],
        );
      }
      // Rivers on edges (hex.ts direction order: E, SE, SW, W, NW, NE).
      const mask = map.riverEdges[i] as number;
      if (mask !== 0) {
        const half = PX / 2;
        if (mask & 0b000001) fillRect(png, x0 + PX - 1, y0, 1, RH, RIVER_COLOR); // E
        if (mask & 0b000010) fillRect(png, x0 + half, y0 + RH - 1, half, 1, RIVER_COLOR); // SE
        if (mask & 0b000100) fillRect(png, x0, y0 + RH - 1, half, 1, RIVER_COLOR); // SW
        if (mask & 0b001000) fillRect(png, x0, y0, 1, RH, RIVER_COLOR); // W
        if (mask & 0b010000) fillRect(png, x0, y0, half, 1, RIVER_COLOR); // NW
        if (mask & 0b100000) fillRect(png, x0 + half, y0, half, 1, RIVER_COLOR); // NE
      }
    }
  }
  return PNG.sync.write(png);
}

/** Generates the map for (seed, size) and renders it — the tested core path. */
export function generatePreview(seed: number, size: MapSizeName): Buffer {
  return renderMapPng(generateMap(new GameRng(seed), size));
}

function main(): void {
  let args: PreviewArgs;
  try {
    args = parsePreviewArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `mapgen-preview: ${error instanceof Error ? error.message : String(error)}\n` +
        'usage: mapgen-preview --seed <n> --size <duel|small|standard|large|huge> --out <file.png>\n',
    );
    process.exit(1);
  }
  const map = generateMap(new GameRng(args.seed), args.size);
  const buffer = renderMapPng(map);
  // pnpm runs scripts with cwd = package dir; INIT_CWD is the invocation dir.
  const path = resolve(process.env['INIT_CWD'] ?? process.cwd(), args.out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  const report = {
    out: path,
    seed: args.seed,
    size: args.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    diagnostics: computeDiagnostics(map),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// Run only as a script, not when imported by tests.
if (process.argv[1] !== undefined && /mapgen-preview\.(ts|js)$/.test(process.argv[1])) {
  main();
}
