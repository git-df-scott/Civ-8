/**
 * Stage 5 — rivers: downhill tracing on the hex VERTEX graph, with lakes.
 *
 * Rivers live on tile edges (doc 02 §2.1, doc 04 §4), so tracing walks
 * hexagon corners: each traversed vertex→vertex step is one hex side, marked
 * into the mirrored riverEdges bitmask. Flow starts at high-ground springs
 * (chosen via the stage substream), always moves to the lowest neighboring
 * vertex (never uphill), merges into rivers it meets, and when trapped in a
 * local minimum carves a Lake tile and ends there. The elevation stage's
 * coast-distance term guarantees a downhill gradient to the sea, so rivers
 * reach water.
 *
 * Vertex model (pointy-top): every corner of the grid is the North or South
 * corner of exactly one tile — vertex id = 2*tileIndex + (0=N | 1=S). The
 * graph is bipartite: N corners connect only to S corners. A vertex is valid
 * only when all three touching tiles are on the map (no rivers across the
 * pole rows' outer corners).
 */

import { toTileIndex, qOfIndex, rOfIndex } from '../hex';
import type { TileIndex } from '../../ids';
import { ELEVATION_LAND_MIN, FEATURE, RESOURCE, TERRAIN } from '../terrain';
import { setRiverEdge, hasRiverEdge } from '../grid';
import type { MapgenContext, MapgenStage } from './types';

/** Minimum average tile elevation (×3 tiles) for a spring vertex. */
const SPRING_MIN_ELEVSUM = 3 * 150;
/** One spring attempt per this many tiles. */
const TILES_PER_SPRING = 220;

const NORTH = 0;
const SOUTH = 1;

/**
 * The three tiles touching a vertex, as tile indices, or null when any of
 * them falls off the north/south map edge.
 *   N(q,r): (q,r), (q+1,r-1) NE, (q,r-1) NW
 *   S(q,r): (q,r), (q-1,r+1) SW, (q,r+1) SE
 */
export function vertexTiles(
  vertex: number,
  width: number,
  height: number,
): [TileIndex, TileIndex, TileIndex] | null {
  const index = (vertex >>> 1) as TileIndex;
  const q = qOfIndex(index, width);
  const r = rOfIndex(index, width);
  if ((vertex & 1) === NORTH) {
    if (r - 1 < 0) {
      return null;
    }
    return [index, toTileIndex(q + 1, r - 1, width), toTileIndex(q, r - 1, width)];
  }
  if (r + 1 >= height) {
    return null;
  }
  return [index, toTileIndex(q - 1, r + 1, width), toTileIndex(q, r + 1, width)];
}

export interface VertexEdge {
  /** The neighboring vertex across one hex side. */
  readonly vertex: number;
  /** The tile whose riverEdges bit this side is stored on... */
  readonly tile: TileIndex;
  /** ...and the direction bit (HEX_DIRECTIONS order) on that tile. */
  readonly dir: number;
}

/**
 * The (up to three) edges leaving a vertex. Each edge is one hex side,
 * identified by its canonical (tile, dir) pair:
 *   from N(q,r): S(q,r-1) = NW side of (q,r);   S(q+1,r-1) = NE side of (q,r);
 *                S(q+1,r-2) = E side of (q,r-1)
 *   from S(q,r): N(q,r+1) = SE side of (q,r);   N(q-1,r+1) = SW side of (q,r);
 *                N(q-1,r+2) = W side of (q,r+1)
 * Edges whose far vertex is invalid (touches off-map tiles) are omitted.
 */
export function vertexEdges(vertex: number, width: number, height: number): VertexEdge[] {
  const index = (vertex >>> 1) as TileIndex;
  const q = qOfIndex(index, width);
  const r = rOfIndex(index, width);
  const edges: VertexEdge[] = [];
  const push = (
    farQ: number,
    farR: number,
    farNS: number,
    tileQ: number,
    tileR: number,
    dir: number,
  ): void => {
    if (farR < 0 || farR >= height || tileR < 0 || tileR >= height) {
      return;
    }
    const far = 2 * toTileIndex(farQ, farR, width) + farNS;
    if (vertexTiles(far, width, height) === null) {
      return;
    }
    edges.push({ vertex: far, tile: toTileIndex(tileQ, tileR, width), dir });
  };
  if ((vertex & 1) === NORTH) {
    push(q, r - 1, SOUTH, q, r, 2); // NW side of (q,r)
    push(q + 1, r - 1, SOUTH, q, r, 1); // NE side of (q,r)
    push(q + 1, r - 2, SOUTH, q, r - 1, 0); // E side of (q,r-1)
  } else {
    push(q, r + 1, NORTH, q, r, 5); // SE side of (q,r)
    push(q - 1, r + 1, NORTH, q, r, 4); // SW side of (q,r)
    push(q - 1, r + 2, NORTH, q, r + 1, 3); // W side of (q,r+1)
  }
  return edges;
}

function elevSum(ctx: MapgenContext, tiles: readonly [TileIndex, TileIndex, TileIndex]): number {
  return (
    (ctx.map.elevation[tiles[0]] as number) +
    (ctx.map.elevation[tiles[1]] as number) +
    (ctx.map.elevation[tiles[2]] as number)
  );
}

function touchesWater(
  ctx: MapgenContext,
  tiles: readonly [TileIndex, TileIndex, TileIndex],
): boolean {
  return (
    ctx.landMask[tiles[0]] === 0 || ctx.landMask[tiles[1]] === 0 || ctx.landMask[tiles[2]] === 0
  );
}

/** Turn the lowest land tile touching `vertex` into a Lake (flow got trapped). */
function carveLake(ctx: MapgenContext, vertex: number): void {
  const tiles = vertexTiles(vertex, ctx.width, ctx.height);
  if (tiles === null) {
    return;
  }
  let lakeTile: TileIndex | null = null;
  let lowest = Infinity;
  for (const t of tiles) {
    const e = ctx.map.elevation[t] as number;
    if (ctx.landMask[t] === 1 && e < lowest) {
      lowest = e;
      lakeTile = t;
    }
  }
  if (lakeTile !== null) {
    ctx.map.terrain[lakeTile] = TERRAIN.Lake;
    ctx.map.elevation[lakeTile] = ELEVATION_LAND_MIN - 20;
    ctx.map.feature[lakeTile] = FEATURE.None;
    ctx.map.resource[lakeTile] = RESOURCE.None;
    ctx.landMask[lakeTile] = 0;
  }
}

export const riversStage: MapgenStage = {
  name: 'rivers',
  run(ctx, stream) {
    const { width, height, map } = ctx;
    const tiles = width * height;

    // Spring candidates, in ascending vertex order (deterministic).
    const candidates: number[] = [];
    for (let v = 0; v < 2 * tiles; v++) {
      const touching = vertexTiles(v, width, height);
      if (
        touching !== null &&
        !touchesWater(ctx, touching) &&
        elevSum(ctx, touching) >= SPRING_MIN_ELEVSUM
      ) {
        candidates.push(v);
      }
    }

    const springCount = Math.min(
      candidates.length,
      Math.max(2, Math.floor(tiles / TILES_PER_SPRING)),
    );
    const globallyVisited = new Uint8Array(2 * tiles);
    const maxSteps = 4 * (width + height);

    for (let s = 0; s < springCount; s++) {
      // Swap-remove pick: no candidate is used twice.
      const pick = stream.nextBounded(candidates.length);
      const spring = candidates[pick] as number;
      candidates[pick] = candidates[candidates.length - 1] as number;
      candidates.pop();

      let vertex = spring;
      const traceVisited = new Set<number>();
      for (let step = 0; ; step++) {
        traceVisited.add(vertex);
        globallyVisited[vertex] = 1;
        const tilesHere = vertexTiles(vertex, width, height);
        if (tilesHere === null || touchesWater(ctx, tilesHere)) {
          break; // reached the sea, a lake, or an off-map corner
        }
        if (step >= maxSteps) {
          carveLake(ctx, vertex); // safety: a cut-off river still ends in water
          break;
        }
        const here = elevSum(ctx, tilesHere);

        // Lowest not-yet-visited neighbor that does not go uphill.
        let next: VertexEdge | null = null;
        let nextElev = Infinity;
        for (const edge of vertexEdges(vertex, width, height)) {
          if (traceVisited.has(edge.vertex)) {
            continue;
          }
          const farTiles = vertexTiles(edge.vertex, width, height);
          if (farTiles === null) {
            continue;
          }
          const e = elevSum(ctx, farTiles);
          if (e <= here && e < nextElev) {
            nextElev = e;
            next = edge;
          }
        }

        if (next === null) {
          carveLake(ctx, vertex); // trapped: end in a lake
          break;
        }
        const merging =
          hasRiverEdge(map, next.tile, next.dir) || globallyVisited[next.vertex] === 1;
        setRiverEdge(map, next.tile, next.dir);
        if (merging) {
          break; // joined an existing river
        }
        vertex = next.vertex;
      }
    }
  },
};
