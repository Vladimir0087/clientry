import base from '@clientry/eslint-config/base';
import { defineConfig } from 'eslint/config';

export default defineConfig(base, {
  languageOptions: {
    parserOptions: { tsconfigRootDir: import.meta.dirname },
  },
});
