import { defineConfig, devices } from '@playwright/test';

import { WEB_ORIGIN } from './support/origins.js';

// Writes the README's media into docs/media; run by hand, never in CI.
export default defineConfig({
  testDir: 'media',
  globalSetup: './global-setup.ts',
  outputDir: 'test-results/media',
  forbidOnly: true,
  // In file order: the tour moves a deal, which the stills before it must not show.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  // The tour takes about 20 s, and encoding its frames a few more.
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_ORIGIN,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    // The web shows times in the browser's zone; a fixed one keeps the files alike on every machine.
    timezoneId: 'UTC',
    // Tracing would take the page's screencast first and shrink the tour's frames to 800 px.
    trace: 'off',
  },
});
