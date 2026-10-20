import { defineConfig, devices } from '@playwright/test';

const webOrigin = process.env.WEB_PUBLIC_URL;
if (webOrigin === undefined || webOrigin === '') {
  throw new Error('Set WEB_PUBLIC_URL to the live web origin');
}

export default defineConfig({
  testDir: 'live',
  forbidOnly: process.env.CI === 'true',
  // A cold Netlify function or a waking Render service can fail the first attempt.
  retries: 2,
  reporter: [[process.env.CI === 'true' ? 'github' : 'list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webOrigin,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
});
