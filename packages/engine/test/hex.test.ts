import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTION_COUNT,
  hexDistance,
  hexLine,
  neighborTile,
  oppositeDirection,
  tileCol,
  tileIndexOf,
  tileRow,
  wrapQ,
} from '../src/map/hex';

const W = 10;
const H = 8;

describe('wrapQ', () => {
  it('wraps into [0, width) for any integer input', () => {
    expect(wrapQ(0, W)).toBe(0);
    expect(wrapQ(9, W)).toBe(9);
    expect(wrapQ(10, W)).toBe(0);
    expect(wrapQ(-1, W)).toBe(9);
    expect(wrapQ(-10, W)).toBe(0);
    expect(wrapQ(25, W)).toBe(5);
    expect(wrapQ(-25, W)).toBe(5);
  });
});

describe('tile index round-trip', () => {
  it('col/row reconstruct the index', () => {
    for (const [col, row] of [
      [0, 0],
      [9, 7],
      [3, 5],
    ] as const) {
      const i = tileIndexOf(col, row, W);
      expect(tileCol(i, W)).toBe(col);
      expect(tileRow(i, W)).toBe(row);
    }
  });
});

describe('neighborTile', () => {
  it('is reciprocal: the opposite direction leads back (including across the wrap)', () => {
    for (let i = 0; i < W * H; i++) {
      for (let d = 0; d < HEX_DIRECTION_COUNT; d++) {
        const n = neighborTile(i, d, W, H);
        if (n !== -1) {
          expect(neighborTile(n, oppositeDirection(d), W, H)).toBe(i);
        }
      }
    }
  });

  it('returns -1 only off the north/south edges (rows do not wrap)', () => {
    // Row 0 has no NW/NE neighbors; row H-1 has no SE/SW neighbors.
    expect(neighborTile(tileIndexOf(4, 0, W), 4, W, H)).toBe(-1);
    expect(neighborTile(tileIndexOf(4, 0, W), 5, W, H)).toBe(-1);
    expect(neighborTile(tileIndexOf(4, H - 1, W), 1, W, H)).toBe(-1);
    expect(neighborTile(tileIndexOf(4, H - 1, W), 2, W, H)).toBe(-1);
    // ...but east/west always wrap.
    expect(neighborTile(tileIndexOf(W - 1, 3, W), 0, W, H)).toBe(tileIndexOf(0, 3, W));
    expect(neighborTile(tileIndexOf(0, 3, W), 3, W, H)).toBe(tileIndexOf(W - 1, 3, W));
  });

  it('every in-map tile has exactly 6 distinct neighbors away from the poles', () => {
    const i = tileIndexOf(5, 4, W);
    const neighbors = new Set<number>();
    for (let d = 0; d < 6; d++) {
      neighbors.add(neighborTile(i, d, W, H));
    }
    expect(neighbors.size).toBe(6);
    expect(neighbors.has(-1)).toBe(false);
    for (const n of neighbors) {
      expect(hexDistance(i, n, W)).toBe(1);
    }
  });
});

describe('hexDistance', () => {
  it('is symmetric and zero on identity', () => {
    const a = tileIndexOf(2, 3, W);
    const b = tileIndexOf(8, 6, W);
    expect(hexDistance(a, a, W)).toBe(0);
    expect(hexDistance(a, b, W)).toBe(hexDistance(b, a, W));
  });

  it('takes the short way around the cylinder', () => {
    const west = tileIndexOf(0, 4, W);
    const east = tileIndexOf(W - 1, 4, W);
    expect(hexDistance(west, east, W)).toBe(1);
  });

  it('matches step counts along a direction', () => {
    let i: number = tileIndexOf(2, 2, W);
    const start = i;
    for (let step = 1; step <= 4; step++) {
      i = neighborTile(i, 0, W, H);
      expect(hexDistance(start, i, W)).toBe(step);
    }
  });
});

describe('hexLine', () => {
  it('starts at a, ends at b, and each step is adjacent', () => {
    const a = tileIndexOf(1, 1, W);
    const b = tileIndexOf(7, 6, W);
    const line = hexLine(a, b, W);
    expect(line[0]).toBe(a);
    expect(line[line.length - 1]).toBe(b);
    expect(line.length).toBe(hexDistance(a, b, W) + 1);
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1] as number, line[i] as number, W)).toBe(1);
    }
  });

  it('crosses the wrap seam when that is shorter', () => {
    const a = tileIndexOf(1, 4, W);
    const b = tileIndexOf(W - 2, 4, W);
    const line = hexLine(a, b, W);
    expect(line.length).toBe(hexDistance(a, b, W) + 1); // distance 3, not 7
    expect(line.length).toBe(4);
  });

  it('a degenerate line is the single tile', () => {
    const a = tileIndexOf(3, 3, W);
    expect(hexLine(a, a, W)).toEqual([a]);
  });
});
