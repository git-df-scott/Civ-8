/**
 * Boot: new game → generated map → chunked Pixi terrain renderer with
 * pan/zoom camera (M2, doc 04 §6). URL params pick the world:
 *   /?seed=7&size=huge   (seed: uint32, size: duel|small|standard|large|huge)
 *
 * The render loop does NO per-frame allocations: camera update, transform
 * write, chunk culling — scalars and preallocated arrays only.
 *
 * Test hooks (Playwright): body[data-ready], window.__civ8 (map info +
 * frame-time probe used by the pan-perf tracing test).
 */

import { Application, Container } from 'pixi.js';
import { DEFAULT_MAP_SIZE, Game, isMapSizeName, type MapSizeName } from '@civ8/engine';
import { Camera } from './render/camera';
import { TerrainLayer } from './render/terrainChunks';
import { mapPixelHeight, mapPixelWidth } from './render/hexLayout';

interface PerfReport {
  frames: number;
  dropped: number;
  droppedPct: number;
  meanMs: number;
  maxMs: number;
}

interface Civ8TestHooks {
  seed: number;
  size: MapSizeName;
  mapWidth: number;
  mapHeight: number;
  chunkCount: number;
  /** One entry per rejected `?seed=`/`?size=` param, e.g. for Playwright assertions. */
  paramWarnings: string[];
  visibleChunks(): number;
  perfStart(): void;
  perfStop(): PerfReport;
}

declare global {
  interface Window {
    __civ8?: Civ8TestHooks;
  }
}

/** A frame slower than this is "dropped" (60Hz budget is 16.7ms; 1.5×). */
const DROPPED_FRAME_MS = 25;

const DEFAULT_SEED = 7;

/**
 * Reads `?seed=`/`?size=` from the URL, falling back to defaults on absence
 * OR on an invalid value. Invalid values never throw or block boot — but
 * they degrade silently unless flagged, unlike the hardened `simArgs.ts`
 * validation this milestone applied to the CLI. `warnings` carries one
 * human/Playwright-readable message per rejected param (surfaced via
 * `console.warn` and `window.__civ8.paramWarnings` in `main()`).
 */
function readWorldParams(): { seed: number; size: MapSizeName; warnings: string[] } {
  const warnings: string[] = [];
  const params = new URLSearchParams(window.location.search);

  const rawSeed = params.get('seed');
  let seed = DEFAULT_SEED;
  if (rawSeed !== null) {
    const parsed = Number(rawSeed);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff) {
      seed = parsed;
    } else {
      warnings.push(
        `invalid ?seed= value "${rawSeed}" (must be an integer in [0, 4294967295]); ` +
          `falling back to default seed ${DEFAULT_SEED}`,
      );
    }
  }

  const rawSize = params.get('size');
  let size: MapSizeName = DEFAULT_MAP_SIZE;
  if (rawSize !== null) {
    if (isMapSizeName(rawSize)) {
      size = rawSize;
    } else {
      warnings.push(
        `invalid ?size= value "${rawSize}" (not a known map size); ` +
          `falling back to default size "${DEFAULT_MAP_SIZE}"`,
      );
    }
  }

  return { seed, size, warnings };
}

async function main(): Promise<void> {
  const { seed, size, warnings: paramWarnings } = readWorldParams();
  for (const warning of paramWarnings) {
    // Visible in devtools for humans, and asserted on directly by Playwright
    // via window.__civ8.paramWarnings below — invalid params must never fail
    // silently the way they used to.
    console.warn(`main: ${warning}`);
  }
  const game = Game.create({ seed, mapSize: size });
  const map = game.map;

  const app = new Application();
  await app.init({
    background: '#10141d',
    resizeTo: window,
    // No MSAA: chunk sprites are prebaked textures (bilinear-filtered under
    // camera scale), and MSAA makes software WebGL (CI) fill-bound.
    antialias: false,
  });
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('missing #app root element');
  }
  root.appendChild(app.canvas);

  // World container: everything the camera moves (terrain now; borders,
  // units, fog arrive as further layers in M3+).
  const world = new Container();
  app.stage.addChild(world);
  const terrain = new TerrainLayer(app.renderer, map);
  world.addChild(terrain.container);

  const camera = new Camera();
  camera.attach(app.canvas);
  const worldW = mapPixelWidth(map.width);
  const worldH = mapPixelHeight(map.height);
  camera.setBounds(app.screen.width, app.screen.height, worldW, worldH);
  app.renderer.on('resize', () => {
    camera.setBounds(app.screen.width, app.screen.height, worldW, worldH);
  });
  // Start fitting the whole map (factor 0 clamps to minScale).
  camera.zoomAt(0, 0, 0);
  camera.applyTo(world);

  // Frame-time probe for the pan-perf test (wall-clock is fine in the app).
  let recording = false;
  let frames = 0;
  let dropped = 0;
  let sumMs = 0;
  let maxMs = 0;

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;
    if (recording) {
      frames += 1;
      sumMs += dt;
      if (dt > DROPPED_FRAME_MS) {
        dropped += 1;
      }
      if (dt > maxMs) {
        maxMs = dt;
      }
    }
    camera.update(dt);
    camera.applyTo(world);
    terrain.rebakeDirty();
    terrain.cull(camera.viewLeft, camera.viewTop, camera.viewRight, camera.viewBottom);
  });

  window.__civ8 = {
    seed,
    size,
    mapWidth: map.width,
    mapHeight: map.height,
    chunkCount: terrain.chunkCount,
    paramWarnings,
    visibleChunks: () => terrain.visibleChunkCount(),
    perfStart: () => {
      frames = 0;
      dropped = 0;
      sumMs = 0;
      maxMs = 0;
      recording = true;
    },
    perfStop: () => {
      recording = false;
      return {
        frames,
        dropped,
        droppedPct: frames === 0 ? 0 : Math.round((10000 * dropped) / frames) / 100,
        meanMs: frames === 0 ? 0 : Math.round((100 * sumMs) / frames) / 100,
        maxMs: Math.round(100 * maxMs) / 100,
      };
    },
  };

  // Signal for Playwright: the map is baked and the first frame is up.
  document.body.dataset['ready'] = '1';
}

main().catch((error: unknown) => {
  // Surface boot failures: without this a Pixi init rejection would leave the
  // e2e polling data-ready until timeout with no diagnostic.
  console.error('boot failed:', error);
  document.body.dataset['ready'] = 'error';
});
