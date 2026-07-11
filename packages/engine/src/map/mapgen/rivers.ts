/**
 * Mapgen stage 5 — downhill river tracing with lakes; rivers live ON EDGES
 * (doc 04 §4: the riverEdges 6-bit mask), so they are traced on the hex
 * VERTEX graph: a river is a chain of hex edges connected corner to corner,
 * flowing from a highland vertex downhill until it touches water — or, when
 * it reaches a pit, ending in a freshly carved lake.
 *
 * Vertex model (pointy-top; corner i at 60°·i − 30°, +y south): every tile
 * owns two canonical vertices — N (its top corner, 270°) and S (its bottom
 * corner, 90°) — encoded as `tile*2 + side` (side 0 = N, 1 = S). N(t)
 * touches tiles {t, NW(t), NE(t)}; its three edges lead to S(NW(t)) across
 * t's NW edge, to S(NE(t)) across t's NE edge, and to S(NE(NW(t))) across
 * the edge between NW(t) and NE(t). S(t) is the mirror image via SW/SE.
 * A vertex's elevation is the minimum of its touching tiles (water = 0), so
 * "downhill" naturally drains toward the sea.
 *
 * Stream: 'mapgen:rivers'. Draws: source shuffle + one side pick per source.
 */

import type { Pcg32 } from '../../rng/pcg32';
import { hexDistance, neighborTile } from '../hex';
import { isWaterTerrain, MOUNTAIN_ELEVATION, TERRAIN } from '../terrain';

export interface RiversResult {
  /** Copy of the input terrain with carved lakes. */
  readonly terrain: Uint8Array;
  /** Copy of the input elevation with lakes zeroed. */
  readonly elevation: Uint8Array;
  readonly riverEdges: Uint8Array;
}

const DIR_E = 0;
const DIR_SE = 1;
const DIR_SW = 2;
const DIR_W = 3;
const DIR_NW = 4;
const DIR_NE = 5;

/** Land elevation above which a tile may seed a river. */
const SOURCE_ELEVATION = MOUNTAIN_ELEVATION - 20;
/** Minimum hex distance between two river sources. */
const SOURCE_SPACING = 5;
/** One river source per this many land tiles. */
const LAND_PER_RIVER = 160;
/** Hard cap on steps per river (headless safety net, never hit in practice). */
const MAX_RIVER_STEPS = 512;

/** One outgoing vertex edge: destination vertex + the tile-edge bits to set. */
interface VertexEdge {
  readonly to: number;
  readonly tileA: number;
  readonly dirA: number;
  readonly tileB: number;
  readonly dirB: number;
}

export function traceRivers(
  width: number,
  height: number,
  terrainIn: Uint8Array,
  elevationIn: Uint8Array,
  stream: Pcg32,
): RiversResult {
  const tiles = width * height;
  const terrain = Uint8Array.from(terrainIn);
  const elevation = Uint8Array.from(elevationIn);
  const riverEdges = new Uint8Array(tiles);

  const nb = (i: number, d: number): number => neighborTile(i, d, width, height);

  /** The three tiles touching a vertex (entries may be -1 off-map). */
  const vertexTiles = (v: number): [number, number, number] => {
    const t = v >> 1;
    return (v & 1) === 0 ? [t, nb(t, DIR_NW), nb(t, DIR_NE)] : [t, nb(t, DIR_SW), nb(t, DIR_SE)];
  };

  const vertexElevation = (v: number): number => {
    let min = 255;
    for (const t of vertexTiles(v)) {
      if (t !== -1 && (elevation[t] as number) < min) {
        min = elevation[t] as number;
      }
    }
    return min;
  };

  const touchesWater = (v: number): boolean => {
    for (const t of vertexTiles(v)) {
      if (t !== -1 && isWaterTerrain(terrain[t] as number)) {
        return true;
      }
    }
    return false;
  };

  /** Outgoing edges of a vertex (only fully on-map ones), fixed order. */
  const vertexEdges = (v: number): VertexEdge[] => {
    const t = v >> 1;
    const edges: VertexEdge[] = [];
    if ((v & 1) === 0) {
      const a = nb(t, DIR_NW);
      const b = nb(t, DIR_NE);
      if (a !== -1) {
        edges.push({ to: a * 2 + 1, tileA: t, dirA: DIR_NW, tileB: a, dirB: DIR_SE });
      }
      if (b !== -1) {
        edges.push({ to: b * 2 + 1, tileA: t, dirA: DIR_NE, tileB: b, dirB: DIR_SW });
      }
      if (a !== -1 && b !== -1) {
        const up = nb(a, DIR_NE);
        if (up !== -1) {
          edges.push({ to: up * 2 + 1, tileA: a, dirA: DIR_E, tileB: b, dirB: DIR_W });
        }
      }
    } else {
      const a = nb(t, DIR_SW);
      const b = nb(t, DIR_SE);
      if (a !== -1) {
        edges.push({ to: a * 2, tileA: t, dirA: DIR_SW, tileB: a, dirB: DIR_NE });
      }
      if (b !== -1) {
        edges.push({ to: b * 2, tileA: t, dirA: DIR_SE, tileB: b, dirB: DIR_NW });
      }
      if (a !== -1 && b !== -1) {
        const down = nb(a, DIR_SE);
        if (down !== -1) {
          edges.push({ to: down * 2, tileA: a, dirA: DIR_E, tileB: b, dirB: DIR_W });
        }
      }
    }
    return edges;
  };

  // --- Source selection: high-land tiles, shuffled, spaced apart. ----------
  const candidates: number[] = [];
  let landCount = 0;
  for (let i = 0; i < tiles; i++) {
    if (!isWaterTerrain(terrain[i] as number)) {
      landCount++;
      if ((elevation[i] as number) >= SOURCE_ELEVATION) {
        candidates.push(i);
      }
    }
  }
  const quota = Math.max(4, Math.floor(landCount / LAND_PER_RIVER));
  // Full Fisher–Yates so source order is stream-determined, then greedy
  // spacing: a candidate too close to an accepted source is skipped.
  for (let k = candidates.length - 1; k > 0; k--) {
    const j = stream.nextBounded(k + 1);
    const tmp = candidates[k] as number;
    candidates[k] = candidates[j] as number;
    candidates[j] = tmp;
  }
  const sources: number[] = [];
  for (const c of candidates) {
    if (sources.length >= quota) {
      break;
    }
    if (sources.every((s) => hexDistance(s, c, width) >= SOURCE_SPACING)) {
      sources.push(c);
    }
  }

  // --- Trace each river. ----------------------------------------------------
  for (const source of sources) {
    let v = source * 2 + stream.nextBounded(2); // N or S corner of the source
    const visited = new Set<number>([v]);
    for (let step = 0; step < MAX_RIVER_STEPS; step++) {
      if (touchesWater(v)) {
        break; // reached sea, coast, or an existing lake
      }
      const here = vertexElevation(v);
      let best: VertexEdge | null = null;
      let bestElevation = 256;
      for (const edge of vertexEdges(v)) {
        if (visited.has(edge.to)) {
          continue;
        }
        const e = vertexElevation(edge.to);
        if (e < bestElevation || (e === bestElevation && best !== null && edge.to < best.to)) {
          bestElevation = e;
          best = edge;
        }
      }
      if (best === null || bestElevation > here) {
        // Pit (or dead end): end the river in a lake on the lowest touching
        // land tile, which future rivers can then drain into.
        let lake = -1;
        let lakeElevation = 256;
        for (const t of vertexTiles(v)) {
          if (t !== -1 && !isWaterTerrain(terrain[t] as number)) {
            if ((elevation[t] as number) < lakeElevation) {
              lakeElevation = elevation[t] as number;
              lake = t;
            }
          }
        }
        if (lake !== -1) {
          terrain[lake] = TERRAIN.LAKE;
          elevation[lake] = 0;
        }
        break;
      }
      riverEdges[best.tileA] = (riverEdges[best.tileA] as number) | (1 << best.dirA);
      riverEdges[best.tileB] = (riverEdges[best.tileB] as number) | (1 << best.dirB);
      v = best.to;
      visited.add(v);
    }
  }

  return { terrain, elevation, riverEdges };
}
