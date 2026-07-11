/**
 * M2 boot: a new game generates a map from the URL seed and renders it with
 * the chunked terrain layer + pan/zoom camera (doc 04 §6).
 *
 *   ?seed=<uint32>  — mapgen seed (default 7, fixed for reproducible smokes)
 *   ?size=<name>    — duel | small | standard | large | huge (default standard)
 *
 * The render loop allocates nothing per frame: camera update/apply and chunk
 * culling are scalar math over preallocated state.
 */

import { Application, Container } from 'pixi.js';
import { Game, isMapSizeName, type MapSizeName } from '@civ8/engine';
import { Camera } from './render/camera';
import { mapPixelHeight, mapPixelWidth } from './render/hexGeometry';
import { TerrainLayer } from './render/terrainLayer';

const DEFAULT_SEED = 7;
const DEFAULT_SIZE: MapSizeName = 'standard';

function readParams(): { seed: number; size: MapSizeName } {
  const params = new URLSearchParams(window.location.search);
  const rawSeed = params.get('seed');
  const parsed = rawSeed === null ? Number.NaN : Number(rawSeed);
  const seed =
    Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff ? parsed : DEFAULT_SEED;
  const rawSize = params.get('size');
  const size = rawSize !== null && isMapSizeName(rawSize) ? rawSize : DEFAULT_SIZE;
  return { seed, size };
}

/** Test hook surface for Playwright (map smoke + pan-perf specs). */
interface Civ8TestHooks {
  readonly game: Game;
  readonly camera: Camera;
  readonly terrain: TerrainLayer;
  readonly app: Application;
}

async function main(): Promise<void> {
  const { seed, size } = readParams();
  const game = Game.create({ seed, mapSize: size });
  const map = game.map;

  const app = new Application();
  await app.init({
    background: '#0a0e16',
    resizeTo: window,
    // Full-screen MSAA is ruinously slow on software WebGL (headless CI) and
    // buys little here: terrain chunks are baked into antialiased
    // RenderTextures (terrainLayer.ts), so edges stay smooth without paying
    // for MSAA on every composited frame.
    antialias: false,
  });

  const root = document.getElementById('app');
  if (!root) {
    throw new Error('missing #app root element');
  }
  root.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const terrain = new TerrainLayer(map, app.renderer);
  world.addChild(terrain.container);

  const worldWidth = mapPixelWidth(map.width);
  const worldHeight = mapPixelHeight(map.height);
  const camera = new Camera({ worldWidth, worldHeight, minScale: 0.12, maxScale: 2.5 });
  camera.attach(app.canvas);
  // Boot framing: the whole map roughly in view, centered.
  camera.setScale(
    Math.max(0.12, Math.min(app.screen.width / worldWidth, app.screen.height / worldHeight)),
  );
  camera.centerOn(worldWidth / 2, worldHeight / 2);

  app.ticker.add((ticker) => {
    camera.update(ticker.deltaMS, app.screen.width, app.screen.height);
    camera.apply(world);
    terrain.update();
    terrain.cull(camera.viewLeft, camera.viewTop, camera.viewRight, camera.viewBottom);
  });

  // Test hooks (harmless in production; typed, not `any`).
  (window as unknown as { __civ8: Civ8TestHooks }).__civ8 = { game, camera, terrain, app };

  // Signal for the Playwright smoke tests: first frame is set up.
  document.body.dataset['ready'] = '1';
}

main().catch((error: unknown) => {
  // Surface boot failures: without this a Pixi init rejection would leave the
  // e2e polling data-ready until timeout with no diagnostic.
  console.error('boot failed:', error);
  document.body.dataset['ready'] = 'error';
});
