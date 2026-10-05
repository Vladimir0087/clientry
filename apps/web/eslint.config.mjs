import next from '@clientry/eslint-config/next';
import { defineConfig } from 'eslint/config';

export default defineConfig({ ignores: ['.next/**', 'next-env.d.ts'] }, next(import.meta.dirname));
