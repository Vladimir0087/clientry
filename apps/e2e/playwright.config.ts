import { defineConfig, devices } from '@playwright/test';

import { WEB_ORIGIN } from './support/origins.js';

const isCi = process.env.CI === 'true';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  // The servers share the machine with the browsers; more workers starve them past the 5 s assertions.
  workers: isCi ? 2 : 4,
  reporter: [[isCi ? 'github' : 'list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: 'phone.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone',
      testMatch: 'phone.spec.ts',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
