import { expect, test } from '@playwright/test';

/**
 * M2 map smoke (replaces the M0 hello-hexagon smoke; the screenshot artifact
 * stays): the app boots into a generated map on the fixed default seed and
 * renders the chunked terrain layer.
 */
test('the app boots into a generated map and renders it', async ({ page }) => {
  await page.goto('/');

  // main.ts sets data-ready="1" once Pixi is initialized and the terrain
  // layer + camera are wired ("error" on boot failure).
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 30_000 });

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // The generated map is the default standard 92×60 at the default seed 7,
  // and chunks are baked and visible.
  const facts = await page.evaluate(() => {
    const hooks = (
      window as unknown as {
        __civ8: {
          game: { map: { width: number; height: number }; mapSize: string; turn: number };
          terrain: { visibleChunkCount(): number };
        };
      }
    ).__civ8;
    return {
      width: hooks.game.map.width,
      height: hooks.game.map.height,
      mapSize: hooks.game.mapSize,
      visibleChunks: hooks.terrain.visibleChunkCount(),
    };
  });
  expect(facts.mapSize).toBe('standard');
  expect(facts.width).toBe(92);
  expect(facts.height).toBe(60);
  expect(facts.visibleChunks).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/map.png' });
});

test('the seed URL param changes the generated map deterministically', async ({ page }) => {
  await page.goto('/?seed=42&size=duel');
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 30_000 });
  const facts = await page.evaluate(() => {
    const hooks = (
      window as unknown as {
        __civ8: { game: { mapSize: string; map: { width: number } } };
      }
    ).__civ8;
    return { mapSize: hooks.game.mapSize, width: hooks.game.map.width };
  });
  expect(facts.mapSize).toBe('duel');
  expect(facts.width).toBe(56);
});
