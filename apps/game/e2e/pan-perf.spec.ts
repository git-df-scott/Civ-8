import { expect, test, type Page } from '@playwright/test';

/**
 * Pan/zoom performance gate (doc 04 §7): scripted pan + zoom over a fully
 * visible huge map must drop < 5% of frames.
 *
 * Frame accounting: a requestAnimationFrame sampler runs in the page while
 * Chrome tracing (frame category) records to test-results/pan-trace.json.
 * The assertion uses the rAF deltas — every interval longer than ~1.5 vsyncs
 * counts the missed vsyncs as dropped. The trace file is kept as a CI
 * artifact for deeper analysis (Perfetto).
 */

const VSYNC_MS = 1000 / 60;

async function startFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rafId: number };
    w.__frames = [];
    let last = performance.now();
    const loop = (t: number): void => {
      w.__frames.push(t - last);
      last = t;
      w.__rafId = requestAnimationFrame(loop);
    };
    w.__rafId = requestAnimationFrame(loop);
  });
}

async function stopFrameSampler(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rafId: number };
    cancelAnimationFrame(w.__rafId);
    return w.__frames;
  });
}

/** Drags the mouse across the viewport with a flick (kicks off inertia). */
async function pan(
  page: Page,
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
): Promise<void> {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + (dx * i) / steps, fromY + (dy * i) / steps);
  }
  await page.mouse.up();
}

test('huge-map pan/zoom drops < 5% of frames (Chrome tracing recorded)', async ({ page }) => {
  test.slow();
  // Headless CI renders WebGL through SwiftShader (software), whose
  // full-screen PRESENT cost alone exceeds a 16.7ms vsync at 1280×720 — even
  // a bare textured-quad loop caps at ~30fps there, regardless of app work
  // (measured: JS render cost is <0.1ms/frame). 800×450 is below that
  // ceiling, so at this size the metric measures OUR render loop (chunk
  // culling, camera math, draw submission) instead of SwiftShader's
  // rasterizer. On real GPUs the app is present-bound nowhere near 720p.
  await page.setViewportSize({ width: 800, height: 450 });
  await page.goto('/?seed=1&size=huge');
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 30_000 });

  // Zoom in so panning actually traverses the map (culling in play) and let
  // the first-frame chunk baking settle before measuring.
  await page.mouse.move(400, 225);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(600);

  const browser = page.context().browser();
  const tracing = browser !== null;
  if (tracing) {
    await browser.startTracing(page, {
      path: 'test-results/pan-trace.json',
      screenshots: false,
      categories: [
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'benchmark',
      ],
    });
  }
  await startFrameSampler(page);

  // ~4s of continuous scripted interaction: four flick pans across the map
  // (inertia keeps scrolling between them) and two zoom pulses.
  await pan(page, 620, 225, -450, -80);
  await page.waitForTimeout(350);
  await pan(page, 180, 120, 420, 160);
  await page.waitForTimeout(350);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(250);
  await pan(page, 400, 350, -150, -220);
  await page.waitForTimeout(350);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(250);
  await pan(page, 400, 120, 200, 200);
  await page.waitForTimeout(500);

  const frames = await stopFrameSampler(page);
  if (tracing) {
    await browser.stopTracing();
  }

  // Ignore the first few samples (sampler startup) and compute dropped
  // vsyncs: an interval of n vsyncs means n-1 dropped frames.
  const samples = frames.slice(5);
  expect(samples.length).toBeGreaterThan(120); // sanity: sampler really ran
  let dropped = 0;
  let expected = 0;
  let worst = 0;
  for (const dt of samples) {
    const vsyncs = Math.max(1, Math.round(dt / VSYNC_MS));
    expected += vsyncs;
    dropped += vsyncs - 1;
    worst = Math.max(worst, dt);
  }
  const droppedPct = (100 * dropped) / expected;
  const report = {
    samples: samples.length,
    expectedVsyncs: expected,
    droppedFrames: dropped,
    droppedPct: Math.round(droppedPct * 100) / 100,
    worstFrameMs: Math.round(worst * 100) / 100,
    meanFrameMs: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100,
  };
  console.log(`pan-perf: ${JSON.stringify(report)}`);

  expect(
    droppedPct,
    `dropped ${dropped}/${expected} frames (${droppedPct.toFixed(2)}%)`,
  ).toBeLessThan(5);
});
