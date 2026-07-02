import { expect, test } from '@playwright/test';

test('the app boots and renders the hello hexagon', async ({ page }) => {
  await page.goto('/');

  // main.ts sets data-ready="1" on <body> once Pixi has initialized and the
  // hexagon has been drawn.
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 30_000 });

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  await page.screenshot({ path: 'test-results/hexagon.png' });
});
