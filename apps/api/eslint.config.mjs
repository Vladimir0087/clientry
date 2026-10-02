import nest from '@clientry/eslint-config/nest';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  // Flat config does not read .gitignore; the generated client fails the strict typed rules.
  { ignores: ['src/infra/prisma/generated/**'] },
  nest,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/infra/prisma/**', 'src/**/*.repository.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Relative to the importer: from src/infra/* the path has no "infra" segment.
              group: ['@prisma/*', '**/prisma/generated/**', '**/prisma/prisma.service*'],
              message: 'Prisma is used only in repositories and src/infra/prisma.',
            },
          ],
        },
      ],
    },
  },
);
