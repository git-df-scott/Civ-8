/**
 * Chunked terrain rendering (doc 04 §6): the map is split into 16×16-hex
 * chunks, each baked ONCE into a RenderTexture and drawn as a single sprite
 * — pan cost is proportional to visible chunks, not tiles (doc 04 §7).
 *
 * - Re-baking happens only when a tile is marked dirty (the tile-change
 *   event seam for M3+; in M2 nothing changes tiles after mapgen).
 * - Camera culling: cull() flips sprite visibility against the view rect.
 * - ZERO per-frame allocations: cull() and rebakeDirty() touch only
 *   preallocated arrays and scalar fields. All allocation happens at
 *   construction/bake time.
 */

import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import {
  ELEVATION_HILLS_MIN,
  ELEVATION_MOUNTAIN_MIN,
  hasRiverEdge,
  tileIndex,
  wrapQ,
  type MapState,
} from '@civ8/engine';
import {
  HEX_CORNERS,
  HEX_SIZE,
  HEX_W,
  ROW_STEP,
  SIDE_CORNERS,
  centerX,
  centerY,
  colOf,
} from './hexLayout';
import {
  FEATURE_COLORS,
  GRID_COLOR,
  MOUNTAIN_COLOR,
  MOUNTAIN_PEAK_COLOR,
  RESOURCE_COLOR,
  RESOURCE_RING,
  RIVER_COLOR,
  TERRAIN_COLORS,
  shade,
} from './palette';

/** Chunk edge length in hexes (doc 04 §6: 16×16-hex groups). */
export const CHUNK_HEXES = 16;

/** Bleed margin: hexes/rivers of border tiles spill past the chunk rect. */
const MARGIN = Math.ceil(HEX_W) + 2;

interface Chunk {
  readonly sprite: Sprite;
  readonly texture: RenderTexture;
  /** World-space rect this chunk's sprite covers (including margin). */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly colStart: number;
  readonly rowStart: number;
  dirty: boolean;
}

export class TerrainLayer {
  readonly container = new Container();
  private readonly chunks: Chunk[] = [];
  private readonly renderer: Renderer;
  private readonly map: MapState;
  /** Scratch corner buffer reused by every polygon during bakes. */
  private readonly corners: number[] = new Array<number>(12).fill(0);
  private readonly g = new Graphics();
  private dirtyCount = 0;

  constructor(renderer: Renderer, map: MapState) {
    this.renderer = renderer;
    this.map = map;
    const across = Math.ceil(map.width / CHUNK_HEXES);
    const down = Math.ceil(map.height / CHUNK_HEXES);
    for (let cj = 0; cj < down; cj++) {
      for (let ci = 0; ci < across; ci++) {
        const colStart = ci * CHUNK_HEXES;
        const rowStart = cj * CHUNK_HEXES;
        const cols = Math.min(CHUNK_HEXES, map.width - colStart);
        const rows = Math.min(CHUNK_HEXES, map.height - rowStart);
        const worldX = colStart * HEX_W;
        const worldY = rowStart * ROW_STEP;
        const w = cols * HEX_W + 2 * MARGIN;
        const h = rows * ROW_STEP + HEX_SIZE + 2 * MARGIN;
        const texture = RenderTexture.create({ width: Math.ceil(w), height: Math.ceil(h) });
        const sprite = new Sprite(texture);
        sprite.position.set(worldX - MARGIN, worldY - MARGIN);
        this.container.addChild(sprite);
        this.chunks.push({
          sprite,
          texture,
          left: worldX - MARGIN,
          top: worldY - MARGIN,
          right: worldX - MARGIN + Math.ceil(w),
          bottom: worldY - MARGIN + Math.ceil(h),
          colStart,
          rowStart,
          dirty: true,
        });
        this.dirtyCount += 1;
      }
    }
    this.rebakeDirty();
  }

  /**
   * The tile-change seam (M3+ events land here): marks the owning chunk —
   * and, because border hexes bleed, the neighboring chunks — for re-bake.
   */
  markTileDirty(index: number): void {
    const r = Math.floor(index / this.map.width);
    const q = index - r * this.map.width;
    const col = colOf(q, r, this.map.width);
    for (const chunk of this.chunks) {
      if (
        col >= chunk.colStart - 1 &&
        col <= chunk.colStart + CHUNK_HEXES &&
        r >= chunk.rowStart - 1 &&
        r <= chunk.rowStart + CHUNK_HEXES
      ) {
        if (!chunk.dirty) {
          chunk.dirty = true;
          this.dirtyCount += 1;
        }
      }
    }
  }

  /** Re-bakes dirty chunks only; a no-op (and allocation-free) otherwise. */
  rebakeDirty(): void {
    if (this.dirtyCount === 0) {
      return;
    }
    for (const chunk of this.chunks) {
      if (chunk.dirty) {
        this.bake(chunk);
        chunk.dirty = false;
      }
    }
    this.dirtyCount = 0;
  }

  /** Camera culling: only chunks intersecting the view rect stay visible. */
  cull(left: number, top: number, right: number, bottom: number): void {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i] as Chunk;
      chunk.sprite.visible =
        chunk.right >= left && chunk.left <= right && chunk.bottom >= top && chunk.top <= bottom;
    }
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  visibleChunkCount(): number {
    let count = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      if ((this.chunks[i] as Chunk).sprite.visible) {
        count += 1;
      }
    }
    return count;
  }

  destroy(): void {
    for (const chunk of this.chunks) {
      chunk.sprite.destroy();
      chunk.texture.destroy(true);
    }
    this.g.destroy();
    this.container.destroy();
  }

  /** Writes the 12 corner coordinates of the hex at (cx, cy) into scratch. */
  private hexCorners(cx: number, cy: number, scale: number): number[] {
    for (let i = 0; i < 6; i++) {
      this.corners[2 * i] = cx + (HEX_CORNERS[2 * i] as number) * scale;
      this.corners[2 * i + 1] = cy + (HEX_CORNERS[2 * i + 1] as number) * scale;
    }
    return this.corners;
  }

  /**
   * Trace the hex outline via moveTo/lineTo — NEVER Graphics.poly(array):
   * Pixi 8 keeps a reference to the array until render, and the shared
   * scratch buffer would leave every hex in the chunk with the last hex's
   * geometry. moveTo/lineTo copy their coordinates immediately.
   */
  private hexPath(cx: number, cy: number, scale: number): Graphics {
    const c = this.hexCorners(cx, cy, scale);
    const g = this.g;
    g.moveTo(c[0] as number, c[1] as number);
    for (let i = 1; i < 6; i++) {
      g.lineTo(c[2 * i] as number, c[2 * i + 1] as number);
    }
    return g.closePath();
  }

  private bake(chunk: Chunk): void {
    const { map, g } = this;
    g.clear();
    const cols = Math.min(CHUNK_HEXES, map.width - chunk.colStart);
    const rows = Math.min(CHUNK_HEXES, map.height - chunk.rowStart);

    // Pass 1: terrain fills + feature/resource marks.
    for (let rowOff = 0; rowOff < rows; rowOff++) {
      const row = chunk.rowStart + rowOff;
      for (let colOff = 0; colOff < cols; colOff++) {
        const col = chunk.colStart + colOff;
        const q = wrapQ(col - (row - (row & 1)) / 2, map.width);
        const index = row * map.width + q;
        const elevation = map.elevation[index] as number;
        let color = TERRAIN_COLORS[map.terrain[index] as number] ?? 0xff00ff;
        if (elevation >= ELEVATION_MOUNTAIN_MIN) {
          color = elevation >= 240 ? MOUNTAIN_PEAK_COLOR : MOUNTAIN_COLOR;
        } else if (elevation >= ELEVATION_HILLS_MIN) {
          color = shade(color, 780);
        }
        const cx = centerX(col, row) - chunk.left;
        const cy = centerY(row) - chunk.top;
        this.hexPath(cx, cy, 1)
          .fill(color)
          .stroke({ width: 1, color: GRID_COLOR, alpha: 0.18 });

        const featureColor = FEATURE_COLORS[map.feature[index] as number];
        if (featureColor !== undefined) {
          this.hexPath(cx, cy, 0.42).fill(featureColor);
        }
        if ((map.resource[index] as number) !== 0) {
          g.circle(cx, cy, HEX_SIZE * 0.22)
            .fill(RESOURCE_COLOR)
            .stroke({ width: 1.5, color: RESOURCE_RING });
        }
      }
    }

    // Pass 2: rivers over the fills (mirrored bits: border edges are drawn
    // by both adjacent chunks, so fills never overpaint a river).
    for (let rowOff = 0; rowOff < rows; rowOff++) {
      const row = chunk.rowStart + rowOff;
      for (let colOff = 0; colOff < cols; colOff++) {
        const col = chunk.colStart + colOff;
        const q = wrapQ(col - (row - (row & 1)) / 2, map.width);
        const index = tileIndex(row * map.width + q);
        if ((map.riverEdges[index] as number) === 0) {
          continue;
        }
        const cx = centerX(col, row) - chunk.left;
        const cy = centerY(row) - chunk.top;
        const corners = this.hexCorners(cx, cy, 1);
        for (let d = 0; d < 6; d++) {
          if (!hasRiverEdge(map, index, d)) {
            continue;
          }
          const [a, b] = SIDE_CORNERS[d] as readonly [number, number];
          g.moveTo(corners[2 * a] as number, corners[2 * a + 1] as number)
            .lineTo(corners[2 * b] as number, corners[2 * b + 1] as number)
            .stroke({ width: 2.5, color: RIVER_COLOR, cap: 'round' });
        }
      }
    }

    this.renderer.render({ container: g, target: chunk.texture, clear: true });
  }
}
