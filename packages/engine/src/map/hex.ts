/**
 * Hex math (doc 04 §4): axial coordinates, pointy-top, Red Blob conventions,
 * with cylindrical east-west wrap.
 *
 * Storage model: tiles live in a width×height rectangle addressed by
 * (col, row) with `TileIndex = row * width + col`. The axial coordinate of a
 * stored tile is `q = col - (row >> 1), r = row` — i.e. storage columns are
 * the odd-r offset layout of the axial grid, so the rectangle renders as a
 * rectangle. ALL neighbor math converts to axial, applies a direction, and
 * converts back through the single `wrapQ()` helper (the only door for the
 * cylinder wrap). Rows do not wrap (pole caps).
 *
 * Directions are ordered by screen angle with +y pointing down (row 0 is the
 * north pole cap): 0=E, 1=SE, 2=SW, 3=W, 4=NW, 5=NE, so
 * `opposite(d) = (d + 3) % 6`. Renderer convention for edges: with hex
 * corner i at angle 60°·i − 30°, edge d spans corners d and d+1 — a
 * `riverEdges` bit d is drawn on exactly that segment.
 *
 * All functions are pure integer math — no floats anywhere.
 */

import type { Branded } from '../ids';

/** Index into the map's typed arrays: `row * width + col`. */
export type TileIndex = Branded<'TileIndex'>;

export function tileIndex(value: number): TileIndex {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`TileIndex must be a non-negative integer, got ${value}`);
  }
  return value as TileIndex;
}

export const HEX_DIRECTION_COUNT = 6;

/** Axial direction deltas, ordered by screen angle: E, SE, SW, W, NW, NE. */
export const HEX_DIR_Q: readonly number[] = [1, 0, -1, -1, 0, 1];
export const HEX_DIR_R: readonly number[] = [0, 1, 1, 0, -1, -1];

/** The direction pointing back across the same edge. */
export function oppositeDirection(d: number): number {
  return (d + 3) % 6;
}

/** The single door for the cylindrical east-west wrap (doc 04 §4). */
export function wrapQ(q: number, width: number): number {
  return ((q % width) + width) % width;
}

export function tileIndexOf(col: number, row: number, width: number): TileIndex {
  return (row * width + col) as TileIndex;
}

export function tileCol(index: number, width: number): number {
  return index % width;
}

export function tileRow(index: number, width: number): number {
  return (index - (index % width)) / width;
}

/**
 * The neighbor tile in direction `d`, or -1 when it falls off the north or
 * south map edge (columns wrap; rows do not).
 */
export function neighborTile(index: number, d: number, width: number, height: number): number {
  const row = tileRow(index, width);
  const nr = row + (HEX_DIR_R[d] as number);
  if (nr < 0 || nr >= height) {
    return -1;
  }
  const q = tileCol(index, width) - (row >> 1) + (HEX_DIR_Q[d] as number);
  return nr * width + wrapQ(q + (nr >> 1), width);
}

/** Axial (cube-projected) hex distance without wrap. */
function axialDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Hex distance between two stored tiles, honoring the east-west wrap: the
 * minimum over the three cylinder representatives of the second tile.
 */
export function hexDistance(a: number, b: number, width: number): number {
  const rowA = tileRow(a, width);
  const rowB = tileRow(b, width);
  const qA = tileCol(a, width) - (rowA >> 1);
  const qB = tileCol(b, width) - (rowB >> 1);
  let best = axialDistance(qA, rowA, qB, rowB);
  for (const shift of [-width, width]) {
    const d = axialDistance(qA, rowA, qB + shift, rowB);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

/** Round(numerator / divisor) to nearest, half away from minus infinity — exact integer math. */
function roundDiv(numerator: number, divisor: number): number {
  return Math.floor((2 * numerator + divisor) / (2 * divisor));
}

/**
 * The line of tiles from `a` to `b` (inclusive), via cube interpolation with
 * integer-exact rounding (Red Blob cube_lerp + cube_round, floats replaced by
 * numerator/denominator arithmetic). The path takes the shorter way around
 * the cylinder; returned indices are wrapped storage indices.
 */
export function hexLine(a: number, b: number, width: number): TileIndex[] {
  const rowA = tileRow(a, width);
  const rowB = tileRow(b, width);
  const qA = tileCol(a, width) - (rowA >> 1);
  let qB = tileCol(b, width) - (rowB >> 1);
  // Choose the cylinder representative of b closest to a.
  for (const shift of [-width, width]) {
    if (axialDistance(qA, rowA, qB + shift, rowB) < axialDistance(qA, rowA, qB, rowB)) {
      qB += shift;
    }
  }
  const n = axialDistance(qA, rowA, qB, rowB);
  const line: TileIndex[] = [];
  for (let i = 0; i <= n; i++) {
    // Cube coords as numerators over denominator n (n = 0 ⇒ single tile).
    const den = n === 0 ? 1 : n;
    const xNum = qA * (den - i) + qB * i;
    const zNum = rowA * (den - i) + rowB * i;
    const yNum = -xNum - zNum;
    let rx = roundDiv(xNum, den);
    let ry = roundDiv(yNum, den);
    let rz = roundDiv(zNum, den);
    const dx = Math.abs(rx * den - xNum);
    const dy = Math.abs(ry * den - yNum);
    const dz = Math.abs(rz * den - zNum);
    if (dx > dy && dx > dz) {
      rx = -ry - rz;
    } else if (dy > dz) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }
    line.push(tileIndexOf(wrapQ(rx + (rz >> 1), width), rz, width));
  }
  return line;
}
