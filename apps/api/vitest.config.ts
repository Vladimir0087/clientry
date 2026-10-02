import { readFileSync } from 'node:fs';

import swc from 'unplugin-swc';
import type { Options } from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// The same compiler and .swcrc as the build. .swcrc pins useDefineForClassFields: false, which
// Nest CLI forces on its own, so class fields behave the same in tests and in dist.
const swcOptions = JSON.parse(readFileSync(new URL('.swcrc', import.meta.url), 'utf8')) as Options;

export default defineConfig({
  plugins: [swc.vite({ ...swcOptions, tsconfigFile: false })],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['**/*.integration.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['{src,test}/**/*.integration.spec.ts'],
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/silence-nest-logger.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
