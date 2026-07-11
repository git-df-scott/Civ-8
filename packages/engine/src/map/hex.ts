/**
 * Axial hex math — pointy-top, Red Blob conventions (doc 04 §4).
 *
 * - Axial coordinates (q, r); cube (x = q, z = r, y = -x-z) converted on
 *   demand for distances and lines.
 * - The map is a cylinder: q wraps east-west through the single `wrapQ()`
 *   helper used by ALL neighbor math; r is clamped by callers (pole caps,
 *   no north-south wrap).
 * - Tiles are addressed by branded `TileIndex` = r * width + q (ids.ts).
 *
 * Everything here is integer math — no floats (docs/determinism.md §2).
 * Screen-space float math (hex → pixel) lives in the renderer, never here.
 */

import { tileIndex, type TileIndex } from '../ids';

/**
 * The six neighbor directions in axial (dq, dr), pointy-top:
 * 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE. The order matches Red Blob's
 * axial_direction_vectors and is the bit order of the riverEdges bitmask
 * (map/grid.ts): bit d = the hex side shared with neighbor(d).
 */
export const HEX_DIRECTIONS: ReadonlyArray<readonly [dq: number, dr: number]> = [
  [1, 0], // 0 E
  [1, -1], // 1 NE
  [0, -1], // 2 NW
  [-1, 0], // 3 W
  [-1, 1], // 4 SW
  [0, 1], // 5 SE
];

/** Direction of the same edge as seen from the neighbor across it. */
export function oppositeDirection(d: number): number {
  return (d + 3) % 6;
}

/**
 * Cylindrical east-west wrap: q reduced to [0, width). The ONE helper all
 * neighbor math goes through (doc 04 §4). Handles any integer q (JS % keeps
 * the dividend's sign, hence the double-modulo).
 */
export function wrapQ(q: number, width: number): number {
  return ((q % width) + width) % width;
}

/** TileIndex of (q, r): wraps q, requires 0 <= r < height at the call site. */
export function toTileIndex(q: number, r: number, width: number): TileIndex {
  return tileIndex(r * width + wrapQ(q, width));
}

export function qOfIndex(index: TileIndex, width: number): number {
  return index % width;
}

export function rOfIndex(index: TileIndex, width: number): number {
  return (index - (index % width)) / width;
}

/**
 * TileIndex of neighbor d of `index`, or -1 when it falls off the north or
 * south map edge (pole caps). Returns a plain number sentinel instead of
 * null so hot mapgen/pathfinding loops stay allocation-free.
 */
export function neighborIndex(index: TileIndex, d: number, width: number, height: number): number {
  const dir = HEX_DIRECTIONS[d];
  if (dir === undefined) {
    throw new RangeError(`neighborIndex: direction must be 0..5, got ${d}`);
  }
  const r = rOfIndex(index, width) + dir[1];
  if (r < 0 || r >= height) {
    return -1;
  }
  return toTileIndex(qOfIndex(index, width) + dir[0], r, width);
}

/** Hex distance in unwrapped axial space (cube metric). */
export function axialDistanceUnwrapped(aq: number, ar: number, bq: number, br: number): number {
  const dq = bq - aq;
  const dr = br - ar;
  // cube distance = (|dx| + |dy| + |dz|) / 2 with dx=dq, dz=dr, dy=-dx-dz
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Hex distance on the cylinder: the shorter way around, computed as the
 * minimum over shifting bq by -width, 0, +width.
 */
export function hexDistance(aq: number, ar: number, bq: number, br: number, width: number): number {
  const q0 = wrapQ(aq, width);
  const q1 = wrapQ(bq, width);
  return Math.min(
    axialDistanceUnwrapped(q0, ar, q1, br),
    axialDistanceUnwrapped(q0, ar, q1 - width, br),
    axialDistanceUnwrapped(q0, ar, q1 + width, br),
  );
}

/**
 * The hexes on the straight line from a to b inclusive, in unwrapped axial
 * space (callers wrapQ the results if they need cylinder coordinates).
 *
 * Integer version of Red Blob's cube lerp + cube_round: each cube coordinate
 * at step i is the exact rational (a*(N-i) + b*i) / N, rounded half-up via
 * floor((2*num + N) / (2*N)); the rounded triple is then repaired to satisfy
 * x + y + z = 0 by recomputing the coordinate with the largest rounding
 * error. All intermediates are exact integers — bit-identical everywhere.
 */
export function hexLine(
  aq: number,
  ar: number,
  bq: number,
  br: number,
): Array<{ q: number; r: number }> {
  const n = axialDistanceUnwrapped(aq, ar, bq, br);
  if (n === 0) {
    return [{ q: aq, r: ar }];
  }
  const ax = aq;
  const az = ar;
  const ay = -ax - az;
  const bx = bq;
  const bz = br;
  const by = -bx - bz;
  const line: Array<{ q: number; r: number }> = [];
  for (let i = 0; i <= n; i++) {
    // Exact numerators over denominator n.
    const nx = ax * (n - i) + bx * i;
    const ny = ay * (n - i) + by * i;
    const nz = az * (n - i) + bz * i;
    // Round half-up: floor((2*num + n) / (2*n)) — exact for negatives too.
    let rx = Math.floor((2 * nx + n) / (2 * n));
    let ry = Math.floor((2 * ny + n) / (2 * n));
    let rz = Math.floor((2 * nz + n) / (2 * n));
    const sum = rx + ry + rz;
    if (sum !== 0) {
      // Twice the absolute rounding error, kept as exact integers.
      const dx = Math.abs(2 * nx - 2 * n * rx);
      const dy = Math.abs(2 * ny - 2 * n * ry);
      const dz = Math.abs(2 * nz - 2 * n * rz);
      if (dx >= dy && dx >= dz) {
        rx = -ry - rz;
      } else if (dy >= dz) {
        ry = -rx - rz;
      } else {
        rz = -rx - ry;
      }
    }
    line.push({ q: rx, r: rz });
  }
  return line;
}
