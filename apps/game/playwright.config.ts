import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * The dev container pre-installs Chromium at /opt/pw-browsers (and sets
 * PLAYWRIGHT_BROWSERS_PATH accordingly). If the pinned @playwright/test ever
 * expects a browser revision that is not present locally, fall back to the
 * stable symlink. In CI, browsers are installed via `playwright install`.
 */
const localChromium = '/opt/pw-browsers/chromium';
const useLocalChromium = !process.env.CI && fs.existsSync(localChromium);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    ...(useLocalChromium ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  webServer: {
    command: 'pnpm exec vite --port 5173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
