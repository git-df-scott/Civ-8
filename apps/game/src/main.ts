/**
 * M0 "hello hexagon": a PixiJS 8 Application drawing one pointy-top hexagon.
 * The real layered map renderer arrives in M2 (doc 04 §6).
 */

import { Application, Graphics } from 'pixi.js';

/** Vertices of a pointy-top hexagon (Red Blob convention: corners at 60°·i − 30°). */
function pointyHexagon(cx: number, cy: number, size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
  }
  return points;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    background: '#10141d',
    resizeTo: window,
    antialias: true,
  });

  const root = document.getElementById('app');
  if (!root) {
    throw new Error('missing #app root element');
  }
  root.appendChild(app.canvas);

  const hex = new Graphics();

  const draw = (): void => {
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    const size = Math.min(app.screen.width, app.screen.height) * 0.3;
    hex
      .clear()
      .poly(pointyHexagon(cx, cy, size))
      .fill(0x3f9e6b)
      .stroke({ width: 6, color: 0xe8ecf1, join: 'round' });
  };

  draw();
  app.renderer.on('resize', draw);
  app.stage.addChild(hex);

  // Signal for the Playwright smoke test: the first frame has been set up.
  document.body.dataset['ready'] = '1';
}

main().catch((error: unknown) => {
  // Surface boot failures: without this a Pixi init rejection would leave the
  // e2e polling data-ready until timeout with no diagnostic.
  console.error('boot failed:', error);
  document.body.dataset['ready'] = 'error';
});
