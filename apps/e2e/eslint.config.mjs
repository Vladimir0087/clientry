import base from '@clientry/eslint-config/base';
import playwright from 'eslint-plugin-playwright';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['playwright-report/**', 'test-results/**', '.logs/**'] },
  base,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['tests/**/*.ts', 'live/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // A test often requests a fixture only for its setup, such as a signed-in owner.
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      'playwright/expect-expect': ['error', { assertFunctionNames: ['expectNoSeriousViolations'] }],
    },
  },
);
