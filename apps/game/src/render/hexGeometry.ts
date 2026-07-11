/**
 * Pixel-space hex layout for the renderer: pointy-top, Red Blob conventions,
 * matching the engine's storage model (map/hex.ts): storage columns are the
 * odd-r offset layout, so tile (col, row) centers at
 *   x = HEX_W · (col + 0.5·(row & 1)) + HEX_W/2
 *   y = ROW_H · row + HEX_SIZE
 *
 * Corner i sits at angle 60°·i − 30° (corner 0 east-north-east, +y down);
 * riverEdges bit d is drawn on the segment between corners d and d+1 — the
 * documented engine edge convention.
 *
 * The unit corner offsets are precomputed ONCE at module load (M0 review
 * carry-over): the render loop and chunk baking never call trig.
 */

export const HEX_SIZE = 24;
export const HEX_W = Math.sqrt(3) * HEX_SIZE;
export const ROW_H = 1.5 * HEX_SIZE;

/** 12 numbers: x0,y0 … x5,y5 — corner offsets from a tile center, in px. */
export const CORNER_OFFSETS: readonly number[] = (() => {
  const offsets: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    offsets.push(HEX_SIZE * Math.cos(angle), HEX_SIZE * Math.sin(angle));
  }
  return offsets;
})();

export function tileCenterX(col: number, row: number): number {
  return HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2;
}

export function tileCenterY(row: number): number {
  return ROW_H * row + HEX_SIZE;
}

/** Full pixel size of a width×height map (odd rows shift right half a hex). */
export function mapPixelWidth(widthTiles: number): number {
  return HEX_W * widthTiles + HEX_W / 2;
}

export function mapPixelHeight(heightTiles: number): number {
  return ROW_H * (heightTiles - 1) + 2 * HEX_SIZE;
}
