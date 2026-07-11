/**
 * mapgen-preview rendering library: seed + size → PNG buffer.
 *
 * The CLI's debug map renderer (doc 04 §1: Canvas2D/pixel rendering survives
 * only here). Draws real pointy-top hex geometry — floats are fine in the
 * CLI; only the ENGINE is integer-only — with terrain fill, relief shading,
 * feature/resource marks, and rivers along hex edges. pngjs stays a CLI
 * dependency; it must never reach the engine (depcruise-enforced).
 *
 * Determinism: the same (seed, size) must produce byte-identical PNGs
 * (test/mapgenPng.test.ts hashes the buffer) — so no timestamps, no
 * metadata, fixed deflate settings.
 */

import { PNG } from 'pngjs';
import {
  ELEVATION_HILLS_MIN,
  ELEVATION_MOUNTAIN_MIN,
  FEATURE,
  TERRAIN,
  generateMapForSeed,
  hasRiverEdge,
  tileIndex,
  wrapQ,
  type MapSizeName,
  type MapState,
} from '@civ8/engine';

/** Hex circumradius in pixels. */
const R = 6;
const SQRT3 = Math.sqrt(3);
const HALF_W = (SQRT3 * R) / 2;

type Rgb = readonly [number, number, number];

const TERRAIN_COLORS: Readonly<Record<number, Rgb>> = {
  [TERRAIN.Ocean]: [0x17, 0x33, 0x54],
  [TERRAIN.Coast]: [0x2b, 0x60, 0x83],
  [TERRAIN.Lake]: [0x3c, 0x86, 0xa8],
  [TERRAIN.Grassland]: [0x4d, 0x9a, 0x45],
  [TERRAIN.Plains]: [0xb8, 0xa8, 0x5c],
  [TERRAIN.Desert]: [0xe3, 0xd2, 0x94],
  [TERRAIN.Tundra]: [0x97, 0x9e, 0x8a],
  [TERRAIN.Snow]: [0xe9, 0xed, 0xf2],
};

const MOUNTAIN_COLOR: Rgb = [0x77, 0x72, 0x6d];
const MOUNTAIN_PEAK_COLOR: Rgb = [0xa8, 0xa4, 0x9e];
const RIVER_COLOR: Rgb = [0x4c, 0x8e, 0xe0];
const FEATURE_COLORS: Readonly<Record<number, Rgb>> = {
  [FEATURE.Forest]: [0x20, 0x59, 0x28],
  [FEATURE.Jungle]: [0x11, 0x6e, 0x39],
  [FEATURE.Marsh]: [0x51, 0x7d, 0x62],
};
const RESOURCE_COLOR: Rgb = [0xf4, 0xe9, 0xc2];
const RESOURCE_RING: Rgb = [0x33, 0x2b, 0x1d];

function shade(color: Rgb, permille: number): Rgb {
  return [
    Math.floor((color[0] * permille) / 1000),
    Math.floor((color[1] * permille) / 1000),
    Math.floor((color[2] * permille) / 1000),
  ];
}

/** Center of tile (q, r) in pixels (odd-r offset layout, wrap-corrected). */
function tileCenter(q: number, r: number, width: number): [number, number] {
  const col = wrapQ(q + (r - (r & 1)) / 2, width);
  const x = HALF_W * (2 * col + (r & 1)) + HALF_W;
  const y = 1.5 * R * r + R;
  return [x, y];
}

function putPixel(png: PNG, x: number, y: number, color: Rgb): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }
  const at = (png.width * y + x) << 2;
  png.data[at] = color[0];
  png.data[at + 1] = color[1];
  png.data[at + 2] = color[2];
  png.data[at + 3] = 255;
}

/** Scanline-fill the pointy-top hexagon centered at (cx, cy). */
function fillHex(png: PNG, cx: number, cy: number, color: Rgb): void {
  for (let py = Math.ceil(cy - R); py <= Math.floor(cy + R); py++) {
    const dy = Math.abs(py - cy);
    const half = dy <= R / 2 ? HALF_W : HALF_W * ((R - dy) / (R / 2));
    if (half < 0) {
      continue;
    }
    for (let px = Math.ceil(cx - half); px <= Math.floor(cx + half); px++) {
      putPixel(png, px, py, color);
    }
  }
}

function drawLine(png: PNG, x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    const px = Math.round(x);
    const py = Math.round(y);
    putPixel(png, px, py, color);
    putPixel(png, px + 1, py, color); // 2px wide so rivers read at R=6
  }
}

/** The two corners of side d of the hex at (cx, cy) — HEX_DIRECTIONS order. */
function sideCorners(cx: number, cy: number, d: number): [number, number, number, number] {
  const n: [number, number] = [cx, cy - R];
  const s: [number, number] = [cx, cy + R];
  const et: [number, number] = [cx + HALF_W, cy - R / 2];
  const eb: [number, number] = [cx + HALF_W, cy + R / 2];
  const wt: [number, number] = [cx - HALF_W, cy - R / 2];
  const wb: [number, number] = [cx - HALF_W, cy + R / 2];
  switch (d) {
    case 0:
      return [et[0], et[1], eb[0], eb[1]]; // E
    case 1:
      return [n[0], n[1], et[0], et[1]]; // NE
    case 2:
      return [wt[0], wt[1], n[0], n[1]]; // NW
    case 3:
      return [wb[0], wb[1], wt[0], wt[1]]; // W
    case 4:
      return [s[0], s[1], wb[0], wb[1]]; // SW
    default:
      return [eb[0], eb[1], s[0], s[1]]; // SE
  }
}

export function renderMapToPng(map: MapState): PNG {
  const pngWidth = Math.ceil(SQRT3 * R * (map.width + 1));
  const pngHeight = Math.ceil(1.5 * R * (map.height - 1) + 2 * R + 1);
  const png = new PNG({ width: pngWidth, height: pngHeight });

  // Pass 1: terrain fills (with relief shading).
  for (let r = 0; r < map.height; r++) {
    for (let q = 0; q < map.width; q++) {
      const index = tileIndex(r * map.width + q);
      const elevation = map.elevation[index] as number;
      let color = TERRAIN_COLORS[map.terrain[index] as number] ?? ([255, 0, 255] as const);
      if (elevation >= ELEVATION_MOUNTAIN_MIN) {
        color = elevation >= 240 ? MOUNTAIN_PEAK_COLOR : MOUNTAIN_COLOR;
      } else if (elevation >= ELEVATION_HILLS_MIN) {
        color = shade(color, 780); // hills: darker
      }
      const [cx, cy] = tileCenter(q, r, map.width);
      fillHex(png, cx, cy, color);
    }
  }

  // Pass 2: features and resources (small center marks).
  for (let r = 0; r < map.height; r++) {
    for (let q = 0; q < map.width; q++) {
      const index = tileIndex(r * map.width + q);
      const [cx, cy] = tileCenter(q, r, map.width);
      const px = Math.round(cx);
      const py = Math.round(cy);
      const featureColor = FEATURE_COLORS[map.feature[index] as number];
      if (featureColor !== undefined) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            putPixel(png, px + dx, py + dy, featureColor);
          }
        }
      }
      if ((map.resource[index] as number) !== 0) {
        putPixel(png, px, py - 1, RESOURCE_RING);
        putPixel(png, px, py + 1, RESOURCE_RING);
        putPixel(png, px - 1, py, RESOURCE_RING);
        putPixel(png, px + 1, py, RESOURCE_RING);
        putPixel(png, px, py, RESOURCE_COLOR);
      }
    }
  }

  // Pass 3: rivers along hex edges (each edge is mirrored; drawing twice
  // hits the same pixels).
  for (let r = 0; r < map.height; r++) {
    for (let q = 0; q < map.width; q++) {
      const index = tileIndex(r * map.width + q);
      if ((map.riverEdges[index] as number) === 0) {
        continue;
      }
      const [cx, cy] = tileCenter(q, r, map.width);
      for (let d = 0; d < 6; d++) {
        if (hasRiverEdge(map, index, d)) {
          const [x0, y0, x1, y1] = sideCorners(cx, cy, d);
          drawLine(png, x0, y0, x1, y1, RIVER_COLOR);
        }
      }
    }
  }

  return png;
}

/** seed + size → deterministic PNG bytes (same input ⇒ byte-identical). */
export function renderMapPngBuffer(seed: number, size: MapSizeName): Buffer {
  const map = generateMapForSeed(seed, size);
  const png = renderMapToPng(map);
  return PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 0 });
}
