import { expect, test } from '@playwright/test';

/**
 * Map smoke (replaces the M0 hexagon smoke; the screenshot artifact stays):
 * a new game on a fixed seed boots into the generated, chunk-rendered map.
 */
test('new game boots into the generated map (seed 7, standard)', async ({ page }) => {
  await page.goto('/?seed=7&size=standard');

  // main.ts sets data-ready="1" once mapgen ran and the chunks are baked.
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 45_000 });

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  const info = await page.evaluate(() => {
    const hooks = window.__civ8!;
    return {
      seed: hooks.seed,
      size: hooks.size,
      mapWidth: hooks.mapWidth,
      mapHeight: hooks.mapHeight,
      chunkCount: hooks.chunkCount,
      visibleChunks: hooks.visibleChunks(),
    };
  });
  expect(info.seed).toBe(7);
  expect(info.size).toBe('standard');
  expect(info.mapWidth).toBe(92);
  expect(info.mapHeight).toBe(60);
  // 16×16-hex chunks: ceil(92/16) × ceil(60/16) = 6 × 4.
  expect(info.chunkCount).toBe(24);
  expect(info.visibleChunks).toBeGreaterThan(0);
  expect(info.visibleChunks).toBeLessThanOrEqual(info.chunkCount);

  await page.screenshot({ path: 'test-results/map.png' });
});

test('the seed URL param picks the world deterministically', async ({ page }) => {
  await page.goto('/?seed=123&size=duel');
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 45_000 });
  const info = await page.evaluate(() => ({
    seed: window.__civ8!.seed,
    size: window.__civ8!.size,
    mapWidth: window.__civ8!.mapWidth,
  }));
  expect(info).toEqual({ seed: 123, size: 'duel', mapWidth: 56 });
});

test('an invalid ?seed= degrades to the default seed with an audible warning', async ({
  page,
}) => {
  const consoleWarnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });

  await page.goto('/?seed=notanumber');
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 45_000 });

  const info = await page.evaluate(() => ({
    seed: window.__civ8!.seed,
    paramWarnings: window.__civ8!.paramWarnings,
  }));

  // Boots anyway, on the default seed — invalid params never block boot.
  expect(info.seed).toBe(7);
  expect(info.paramWarnings).toHaveLength(1);
  expect(info.paramWarnings[0]).toMatch(/seed/i);
  expect(info.paramWarnings[0]).toMatch(/notanumber/);
  // The same diagnostic reaches the devtools console, not just the test hook.
  expect(consoleWarnings.some((text) => text.includes('notanumber'))).toBe(true);
});
