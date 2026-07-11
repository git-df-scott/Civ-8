import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  axialDistanceUnwrapped,
  hexDistance,
  hexLine,
  neighborIndex,
  oppositeDirection,
  qOfIndex,
  rOfIndex,
  toTileIndex,
  wrapQ,
} from '../src/map/hex';
import { tileIndex } from '../src/ids';

describe('hex math (axial, pointy-top, cylindrical wrap)', () => {
  it('wrapQ reduces any integer into [0, width)', () => {
    expect(wrapQ(0, 56)).toBe(0);
    expect(wrapQ(55, 56)).toBe(55);
    expect(wrapQ(56, 56)).toBe(0);
    expect(wrapQ(-1, 56)).toBe(55);
    expect(wrapQ(-57, 56)).toBe(55);
    expect(wrapQ(113, 56)).toBe(1);
  });

  it('toTileIndex is r*width + wrapped q; qOfIndex/rOfIndex invert it', () => {
    expect(toTileIndex(3, 2, 56)).toBe(2 * 56 + 3);
    expect(toTileIndex(-1, 2, 56)).toBe(2 * 56 + 55); // wraps west
    expect(toTileIndex(56, 2, 56)).toBe(2 * 56); // wraps east
    const index = toTileIndex(17, 9, 56);
    expect(qOfIndex(index, 56)).toBe(17);
    expect(rOfIndex(index, 56)).toBe(9);
  });

  it('the six directions are E, NE, NW, W, SW, SE with opposite pairs 3 apart', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6);
    for (let d = 0; d < 6; d++) {
      const dir = HEX_DIRECTIONS[d]!;
      const opp = HEX_DIRECTIONS[oppositeDirection(d)]!;
      // Sum-to-zero (not toBe(-x)): -0 !== 0 under Object.is.
      expect(opp[0] + dir[0]).toBe(0);
      expect(opp[1] + dir[1]).toBe(0);
    }
  });

  it('neighborIndex wraps east-west and returns -1 off the poles', () => {
    const width = 56;
    const height = 36;
    // East from the last column wraps to column 0.
    expect(neighborIndex(toTileIndex(55, 10, width), 0, width, height)).toBe(
      toTileIndex(0, 10, width),
    );
    // West from column 0 wraps to the last column.
    expect(neighborIndex(toTileIndex(0, 10, width), 3, width, height)).toBe(
      toTileIndex(55, 10, width),
    );
    // NW/NE from row 0 fall off the north pole.
    expect(neighborIndex(toTileIndex(5, 0, width), 1, width, height)).toBe(-1);
    expect(neighborIndex(toTileIndex(5, 0, width), 2, width, height)).toBe(-1);
    // SW/SE from the last row fall off the south pole.
    expect(neighborIndex(toTileIndex(5, height - 1, width), 4, width, height)).toBe(-1);
    expect(neighborIndex(toTileIndex(5, height - 1, width), 5, width, height)).toBe(-1);
    expect(() => neighborIndex(tileIndex(0), 6, width, height)).toThrow(RangeError);
  });

  it('every neighbor is at hex distance 1 (cylinder metric) [property]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 55 }),
        fc.integer({ min: 1, max: 34 }),
        fc.integer({ min: 0, max: 5 }),
        (q, r, d) => {
          const width = 56;
          const n = neighborIndex(toTileIndex(q, r, width), d, width, 36);
          expect(n).toBeGreaterThanOrEqual(0);
          const nq = qOfIndex(tileIndex(n), width);
          const nr = rOfIndex(tileIndex(n), width);
          expect(hexDistance(q, r, nq, nr, width)).toBe(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('hexDistance takes the short way around the cylinder', () => {
    // Straight across the seam: q=1 → q=54 on width 56 is 3 steps west.
    expect(hexDistance(1, 10, 54, 10, 56)).toBe(3);
    expect(hexDistance(54, 10, 1, 10, 56)).toBe(3);
    // Without wrap it would be 53.
    expect(axialDistanceUnwrapped(1, 10, 54, 10)).toBe(53);
    // Halfway around is the worst case.
    expect(hexDistance(0, 10, 28, 10, 56)).toBe(28);
  });

  it('hexLine returns a contiguous line of dist+1 hexes with exact endpoints [property]', () => {
    const coord = fc.integer({ min: -30, max: 30 });
    fc.assert(
      fc.property(coord, coord, coord, coord, (aq, ar, bq, br) => {
        const line = hexLine(aq, ar, bq, br);
        const n = axialDistanceUnwrapped(aq, ar, bq, br);
        expect(line).toHaveLength(n + 1);
        expect(line[0]).toEqual({ q: aq, r: ar });
        expect(line[line.length - 1]).toEqual({ q: bq, r: br });
        for (let i = 1; i < line.length; i++) {
          const prev = line[i - 1]!;
          const next = line[i]!;
          expect(axialDistanceUnwrapped(prev.q, prev.r, next.q, next.r)).toBe(1);
        }
      }),
      { numRuns: 500 },
    );
  });
});
