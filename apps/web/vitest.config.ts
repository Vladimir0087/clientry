import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const SRC = fileURLToPath(new URL('src', import.meta.url));
const EMPTY_MODULE = fileURLToPath(new URL('test/empty-module.ts', import.meta.url));
const SERVER_SPECS = 'src/**/*.server.spec.{ts,tsx}';

export default defineConfig({
  resolve: { alias: { '@': SRC } },
  test: {
    projects: [
      {
        extends: true,
        // Outside the react-server condition server-only throws on import; Next's server build
        // resolves it to an empty module.
        resolve: { alias: { 'server-only': EMPTY_MODULE } },
        test: {
          name: 'node',
          environment: 'node',
          include: [SERVER_SPECS],
          setupFiles: ['test/setup-env.ts', 'test/setup-msw.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.spec.{ts,tsx}'],
          exclude: [SERVER_SPECS],
          setupFiles: ['test/setup-msw.ts', 'test/setup-dom.ts'],
        },
      },
    ],
  },
});
