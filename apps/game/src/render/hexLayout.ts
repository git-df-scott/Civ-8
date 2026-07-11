/**
 * Screen-space hex layout for the renderer (floats are fine here — the
 * ENGINE is integer-only, the renderer is not; doc 04 §4).
 *
 * Pointy-top hexes in odd-r offset layout: axial q is wrapped into a column
 * so the cylinder renders as a clean rectangle. The unit-hexagon corner
 * offsets are precomputed ONCE at module load (M0 review carry-over) —
 * nothing in the render loop ever recomputes trigonometry.
 */

import { wrapQ } from '@civ8/engine';

/** Hex circumradius in world pixels at scale 1. */
export const HEX_SIZE = 18;
export const SQRT3 = Math.sqrt(3);
/** Horizontal distance between adjacent columns. */
export const HEX_W = SQRT3 * HEX_SIZE;
/** Vertical distance between adjacent rows. */
export const ROW_STEP = 1.5 * HEX_SIZE;

/**
 * Corner offsets of a pointy-top hexagon around (0,0), interleaved
 * [x0, y0, x1, y1, …] at angles 60°·i − 30° (Red Blob convention), computed
 * exactly once at module load.
 */
export const HEX_CORNERS: readonly number[] = (() => {
  const corners: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push(HEX_SIZE * Math.cos(angle), HEX_SIZE * Math.sin(angle));
  }
  return corners;
})();

/**
 * Endpoints of hex side `d` (engine HEX_DIRECTIONS order: E, NE, NW, W, SW,
 * SE) as corner indices into HEX_CORNERS. Corner i sits at 60°·i − 30°, so
 * with y down: 0=NE corner, 1=SE corner, 2=S, 3=SW, 4=NW, 5=N.
 */
export const SIDE_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // E side: NE→SE corners
  [5, 0], // NE side: N→NE
  [4, 5], // NW side: NW→N
  [3, 4], // W side: SW→NW
  [2, 3], // SW side: S→SW
  [1, 2], // SE side: SE→S
];

/** Offset column of tile (q, r): the cylinder unrolled into a rectangle. */
export function colOf(q: number, r: number, width: number): number {
  return wrapQ(q + (r - (r & 1)) / 2, width);
}

/** World-x of the center of the hex at offset (col, row). */
export function centerX(col: number, row: number): number {
  return HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2;
}

/** World-y of the center of the hex at offset (col, row). */
export function centerY(row: number): number {
  return ROW_STEP * row + HEX_SIZE;
}

/** Total world size of a map in pixels. */
export function mapPixelWidth(widthTiles: number): number {
  return HEX_W * (widthTiles + 0.5);
}

export function mapPixelHeight(heightTiles: number): number {
  return ROW_STEP * (heightTiles - 1) + 2 * HEX_SIZE;
}
