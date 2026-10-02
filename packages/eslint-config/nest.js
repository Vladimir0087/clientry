import { defineConfig } from 'eslint/config';

import base from './base.js';

export default defineConfig(
  base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // With the decorator options above, the fixer keeps value imports that injection needs.
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.service.ts', '**/*.repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Deep paths such as @nestjs/common/exceptions/index.js export the same classes.
              regex: '^@nestjs/common(/.*)?$',
              importNamePattern: 'Exception$',
              message: 'Services and repositories throw domain errors from common/errors.',
            },
          ],
        },
      ],
    },
  },
);
