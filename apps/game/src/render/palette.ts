/**
 * Render palette: terrain/feature/river/resource colors, one place.
 * (The CLI's mapgen-preview keeps its own palette — cli must not import
 * renderer code; if they drift it's cosmetic.)
 */

import { FEATURE, TERRAIN } from '@civ8/engine';

export const TERRAIN_COLORS: Readonly<Record<number, number>> = {
  [TERRAIN.Ocean]: 0x173354,
  [TERRAIN.Coast]: 0x2b6083,
  [TERRAIN.Lake]: 0x3c86a8,
  [TERRAIN.Grassland]: 0x4d9a45,
  [TERRAIN.Plains]: 0xb8a85c,
  [TERRAIN.Desert]: 0xe3d294,
  [TERRAIN.Tundra]: 0x979e8a,
  [TERRAIN.Snow]: 0xe9edf2,
};

export const MOUNTAIN_COLOR = 0x77726d;
export const MOUNTAIN_PEAK_COLOR = 0xa8a49e;
export const RIVER_COLOR = 0x4c8ee0;
export const GRID_COLOR = 0x0c1018;

export const FEATURE_COLORS: Readonly<Record<number, number>> = {
  [FEATURE.Forest]: 0x205928,
  [FEATURE.Jungle]: 0x116e39,
  [FEATURE.Marsh]: 0x517d62,
};

export const RESOURCE_COLOR = 0xf4e9c2;
export const RESOURCE_RING = 0x332b1d;

/** Darken a 0xRRGGBB color to `permille`/1000 brightness. */
export function shade(color: number, permille: number): number {
  const r = Math.floor((((color >> 16) & 0xff) * permille) / 1000);
  const g = Math.floor((((color >> 8) & 0xff) * permille) / 1000);
  const b = Math.floor(((color & 0xff) * permille) / 1000);
  return (r << 16) | (g << 8) | b;
}
