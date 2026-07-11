/**
 * Chunked terrain rendering (doc 04 §6): the map is split into 16×16-hex
 * chunks, each baked ONCE into a RenderTexture and drawn as a single sprite.
 * Panning cost is therefore proportional to visible chunks, not tiles.
 * Chunks re-bake only when a tile inside them is marked dirty (tile-change
 * events arrive in M3+), and `cull()` runs every frame with zero allocations
 * against the camera's world-space viewport.
 */

import {
  Container,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  type Renderer,
} from 'pixi.js';
import { FEATURE, RELIEF, reliefOf, TERRAIN, tileCol, tileRow, type MapState } from '@civ8/engine';
import { CORNER_OFFSETS, HEX_SIZE, HEX_W, ROW_H, tileCenterX, tileCenterY } from './hexGeometry';

export const CHUNK_TILES = 16;

/** Fill colors by terrain id (TERRAIN order). */
const TERRAIN_FILL: readonly number[] = [
  0x122c54, // ocean
  0x26548a, // coast
  0x3476b0, // lake
  0x4e8a3c, // grassland
  0x969444, // plains
  0xd4b974, // desert
  0x8c9480, // tundra
  0xe6ecf0, // snow
];

const FEATURE_FILL: readonly number[] = [0, 0x1e4820, 0x125818, 0x3a685c];
const RESOURCE_FILL: readonly number[] = [
  0, 0xb0b0c0, 0xd9a066, 0xffe066, 0xc8c8c8, 0x9ad1ff, 0xffd700,
];
const MOUNTAIN_FILL = 0x686058;
const MOUNTAIN_PEAK = 0x9a938a;
const RIVER_COLOR = 0x40a0ff;
const GRID_COLOR = 0x0c1018;

export class TerrainLayer {
  readonly container = new Container();

  private readonly map: MapState;
  private readonly renderer: Renderer;
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly sprites: Sprite[] = [];
  private readonly textures: RenderTexture[] = [];
  /** Per-chunk world-space bounds: x, y, w, h (flat, for allocation-free culling). */
  private readonly bounds: Float64Array;
  private readonly dirty: Uint8Array;
  private anyDirty = false;
  /** Scratch Graphics reused for every bake — never allocated per frame. */
  private readonly scratch = new Graphics();

  constructor(map: MapState, renderer: Renderer) {
    this.map = map;
    this.renderer = renderer;
    this.chunksX = Math.ceil(map.width / CHUNK_TILES);
    this.chunksY = Math.ceil(map.height / CHUNK_TILES);
    const count = this.chunksX * this.chunksY;
    this.bounds = new Float64Array(count * 4);
    this.dirty = new Uint8Array(count);
    // A chunk's CORE pixels span 16.5 hex widths (odd-row shift + corner
    // bleed) and 15 row-steps + a full hex height vertically. The texture is
    // padded by one tile on every side and the bake includes that neighbor
    // ring, but each SPRITE shows only the core via a texture frame: border
    // texels at low mip levels then blend with real baked terrain instead of
    // transparency (no seams), while on-screen overdraw stays minimal.
    const coreWidth = Math.ceil((CHUNK_TILES + 0.5) * HEX_W);
    const coreHeight = Math.ceil((CHUNK_TILES - 1) * ROW_H + 2 * HEX_SIZE);
    const padX = Math.ceil(HEX_W);
    const padY = Math.ceil(ROW_H);
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const chunk = cy * this.chunksX + cx;
        const originX = cx * CHUNK_TILES * HEX_W;
        const originY = cy * CHUNK_TILES * ROW_H;
        // Antialias the bake (a one-off cost per chunk), not the frame; and
        // generate mipmaps: zoomed-out sampling of un-mipmapped chunk
        // textures is a cache-thrashing disaster on software GL (CI) and
        // shimmering on real GPUs.
        const texture = RenderTexture.create({
          width: coreWidth + 2 * padX,
          height: coreHeight + 2 * padY,
          antialias: true,
          autoGenerateMipmaps: true,
        });
        const core = new Texture({
          source: texture.source,
          frame: new Rectangle(padX, padY, coreWidth, coreHeight),
        });
        const sprite = new Sprite(core);
        sprite.position.set(originX, originY);
        this.textures.push(texture);
        this.sprites.push(sprite);
        this.container.addChild(sprite);
        this.bounds[chunk * 4] = originX;
        this.bounds[chunk * 4 + 1] = originY;
        this.bounds[chunk * 4 + 2] = coreWidth;
        this.bounds[chunk * 4 + 3] = coreHeight;
        this.bake(chunk);
      }
    }
  }

  /**
   * Marks every chunk whose bake includes `index` for re-bake (tile-change
   * events, M3+). Because chunks bake a one-tile overlap ring, a border tile
   * can live in up to four chunks' textures.
   */
  markTileDirty(index: number): void {
    const col = tileCol(index, this.map.width);
    const row = tileRow(index, this.map.width);
    for (
      let cy = Math.floor((row - 1) / CHUNK_TILES);
      cy <= Math.floor((row + 1) / CHUNK_TILES);
      cy++
    ) {
      for (
        let cx = Math.floor((col - 1) / CHUNK_TILES);
        cx <= Math.floor((col + 1) / CHUNK_TILES);
        cx++
      ) {
        if (cx >= 0 && cx < this.chunksX && cy >= 0 && cy < this.chunksY) {
          this.dirty[cy * this.chunksX + cx] = 1;
          this.anyDirty = true;
        }
      }
    }
  }

  /** Re-bakes dirty chunks. No-op (and allocation-free) when nothing changed. */
  update(): void {
    if (!this.anyDirty) {
      return;
    }
    for (let chunk = 0; chunk < this.dirty.length; chunk++) {
      if (this.dirty[chunk] === 1) {
        this.dirty[chunk] = 0;
        this.bake(chunk);
      }
    }
    this.anyDirty = false;
  }

  /** Camera-culls chunk sprites against a world-space viewport. Zero allocations. */
  cull(viewLeft: number, viewTop: number, viewRight: number, viewBottom: number): void {
    for (let chunk = 0; chunk < this.sprites.length; chunk++) {
      const x = this.bounds[chunk * 4] as number;
      const y = this.bounds[chunk * 4 + 1] as number;
      const w = this.bounds[chunk * 4 + 2] as number;
      const h = this.bounds[chunk * 4 + 3] as number;
      (this.sprites[chunk] as Sprite).visible =
        x < viewRight && x + w > viewLeft && y < viewBottom && y + h > viewTop;
    }
  }

  /** Number of currently visible (non-culled) chunk sprites — for tests/debug. */
  visibleChunkCount(): number {
    let visible = 0;
    for (const sprite of this.sprites) {
      if (sprite.visible) {
        visible++;
      }
    }
    return visible;
  }

  /**
   * Traces the hex outline into the Graphics path via moveTo/lineTo —
   * deliberately NOT g.poly(sharedArray): Pixi v8 Graphics retains the
   * points array by reference until geometry build, so a reused array would
   * collapse every recorded hex onto the last one's coordinates.
   */
  private static hexPath(g: Graphics, cx: number, cy: number, size = 1): Graphics {
    g.moveTo(cx + (CORNER_OFFSETS[0] as number) * size, cy + (CORNER_OFFSETS[1] as number) * size);
    for (let c = 1; c < 6; c++) {
      g.lineTo(
        cx + (CORNER_OFFSETS[c * 2] as number) * size,
        cy + (CORNER_OFFSETS[c * 2 + 1] as number) * size,
      );
    }
    return g.closePath();
  }

  /** Draws every tile of a chunk into its RenderTexture. */
  private bake(chunk: number): void {
    const { map } = this;
    const cx = chunk % this.chunksX;
    const cy = (chunk - cx) / this.chunksX;
    // Texture origin = core origin minus the one-tile padding.
    const originX = (this.bounds[chunk * 4] as number) - Math.ceil(HEX_W);
    const originY = (this.bounds[chunk * 4 + 1] as number) - Math.ceil(ROW_H);
    // Bake range includes the one-tile overlap ring (clamped at map edges).
    const col0 = Math.max(0, cx * CHUNK_TILES - 1);
    const row0 = Math.max(0, cy * CHUNK_TILES - 1);
    const col1 = Math.min(cx * CHUNK_TILES + CHUNK_TILES + 1, map.width);
    const row1 = Math.min(cy * CHUNK_TILES + CHUNK_TILES + 1, map.height);
    const g = this.scratch;
    g.clear();
    g.position.set(-originX, -originY);

    // Pass 1: terrain fills, relief, features, resources.
    for (let row = row0; row < row1; row++) {
      for (let col = col0; col < col1; col++) {
        const i = row * map.width + col;
        const x = tileCenterX(col, row);
        const y = tileCenterY(row);
        const terr = map.terrain[i] as number;
        const relief = reliefOf(map.elevation[i] as number);
        TerrainLayer.hexPath(g, x, y).fill(
          relief === RELIEF.MOUNTAIN ? MOUNTAIN_FILL : TERRAIN_FILL[terr],
        );
        TerrainLayer.hexPath(g, x, y).stroke({ width: 1, color: GRID_COLOR, alpha: 0.25 });
        if (relief === RELIEF.HILLS) {
          TerrainLayer.hexPath(g, x, y, 0.55).fill({ color: 0x000000, alpha: 0.22 });
        } else if (relief === RELIEF.MOUNTAIN) {
          // Peak triangle.
          g.moveTo(x - HEX_SIZE * 0.5, y + HEX_SIZE * 0.42)
            .lineTo(x, y - HEX_SIZE * 0.55)
            .lineTo(x + HEX_SIZE * 0.5, y + HEX_SIZE * 0.42)
            .closePath()
            .fill(MOUNTAIN_PEAK);
        }
        const feat = map.feature[i] as number;
        if (feat !== FEATURE.NONE) {
          g.circle(x, y, HEX_SIZE * 0.38).fill({
            color: FEATURE_FILL[feat] as number,
            alpha: 0.85,
          });
        }
        const res = map.resource[i] as number;
        if (res !== 0) {
          g.circle(x, y + HEX_SIZE * 0.45, HEX_SIZE * 0.16).fill(RESOURCE_FILL[res] as number);
        }
        if (terr === TERRAIN.COAST) {
          TerrainLayer.hexPath(g, x, y, 0.9).stroke({ width: 1.5, color: 0x7fb2e5, alpha: 0.35 });
        }
      }
    }

    // Pass 2: rivers on edges (bit d spans corners d and d+1), over the fills.
    for (let row = row0; row < row1; row++) {
      for (let col = col0; col < col1; col++) {
        const i = row * map.width + col;
        const mask = map.riverEdges[i] as number;
        if (mask === 0) {
          continue;
        }
        const x = tileCenterX(col, row);
        const y = tileCenterY(row);
        for (let d = 0; d < 6; d++) {
          if ((mask & (1 << d)) === 0) {
            continue;
          }
          const c0 = d * 2;
          const c1 = ((d + 1) % 6) * 2;
          g.moveTo(x + (CORNER_OFFSETS[c0] as number), y + (CORNER_OFFSETS[c0 + 1] as number))
            .lineTo(x + (CORNER_OFFSETS[c1] as number), y + (CORNER_OFFSETS[c1 + 1] as number))
            .stroke({ width: 4, color: RIVER_COLOR, alpha: 0.9, cap: 'round' });
        }
      }
    }

    const texture = this.textures[chunk] as RenderTexture;
    this.renderer.render({
      container: g,
      target: texture,
      clear: true,
    });
    // Rebuild the mip chain for the freshly baked content.
    texture.source.updateMipmaps();
  }
}
