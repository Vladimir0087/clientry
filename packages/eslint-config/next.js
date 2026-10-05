import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import nextPlugin from '@next/eslint-plugin-next';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

import base from './base.js';

// The resolver is a dependency of this preset, not of the app, so it is passed by path.
const TYPESCRIPT_RESOLVER = fileURLToPath(import.meta.resolve('eslint-import-resolver-typescript'));

const LAYERED_FILES = ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'];

// '.', '..', '../..' and the like: a directory, so the slice's own index.
const RELATIVE_DIRECTORY = String.raw`^\.{1,2}(/\.{1,2})*/?$`;
const RELATIVE_INDEX = String.raw`^\.{1,2}/(.*/)?index(\.tsx?)?$`;

const SHARED_BY_FILE = {
  regex: String.raw`^@/shared(/[^/]+)?/?$`,
  message: 'Import shared file by file, e.g. @/shared/ui/button.',
};

const ELEMENTS = [
  { type: 'app', pattern: 'src/app' },
  { type: 'features', pattern: 'src/features/*', capture: ['slice'] },
  { type: 'entities', pattern: 'src/entities/*', capture: ['slice'] },
  { type: 'shared', pattern: 'src/shared/*', capture: ['segment'] },
  { type: 'test', pattern: 'test' },
];

// A single file cannot be an element, so the proxy joins the app layer as a file category.
const FILE_CATEGORIES = [
  { pattern: 'src/proxy.ts', category: 'app' },
  { pattern: 'src/proxy.*spec.ts', category: 'proxy-spec' },
  { pattern: '**/*.spec.{ts,tsx}', category: 'spec' },
];

function ownPublicApi(layer) {
  return [
    {
      regex: `^@/${layer}(/|$)`,
      message: `Inside ${layer}, import own files relatively; other ${layer} slices are off-limits.`,
    },
    { regex: RELATIVE_DIRECTORY, message: 'Import the file directly, not the slice index.' },
    { regex: RELATIVE_INDEX, message: 'Import the file directly, not the slice index.' },
  ];
}

function throughIndex(type) {
  return { element: { type, fileInternalPath: 'index.ts' } };
}

const LAYER_POLICIES = [
  { allow: { to: { module: { origin: 'external' } } } },
  { allow: { to: { module: { origin: 'core' } } } },
  { allow: { dependency: { relationship: { to: 'internal' } } } },
  {
    from: [{ element: { type: 'app' } }, { file: { categories: 'app' } }],
    allow: [
      { to: throughIndex('features') },
      { to: throughIndex('entities') },
      { to: { element: { type: 'shared' } } },
    ],
  },
  {
    from: { element: { type: 'features' } },
    allow: [{ to: throughIndex('entities') }, { to: { element: { type: 'shared' } } }],
  },
  {
    from: { element: { type: 'entities' } },
    allow: { to: { element: { type: 'shared' } } },
  },
  {
    from: { element: { type: 'shared' } },
    allow: { to: { element: { type: 'shared' } } },
  },
  {
    from: { element: { type: 'test' } },
    allow: [{ to: { element: { type: '*' } } }, { to: { file: { categories: 'app' } } }],
  },
  {
    from: { file: { categories: 'spec' } },
    allow: { to: { element: { type: 'test' } } },
  },
  // Outside any element, the proxy is not internal to its own spec.
  {
    from: { file: { categories: 'proxy-spec' } },
    allow: { to: { file: { categories: 'app' } } },
  },
];

function restrictedImports(patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

// Takes the app directory: lint-staged runs ESLint from the repo root, where the resolvers and
// the Next rules would otherwise look for tsconfig.json and src/app.
export default function next(rootDir) {
  const project = join(rootDir, 'tsconfig.json');
  return defineConfig(
    base,
    {
      files: ['**/*.{ts,tsx}'],
      extends: [
        nextPlugin.configs.recommended,
        nextPlugin.configs['core-web-vitals'],
        reactHooks.configs.flat.recommended,
        jsxA11y.configs.recommended,
      ],
      languageOptions: { parserOptions: { tsconfigRootDir: rootDir } },
      settings: {
        next: { rootDir },
        'import-x/internal-regex': '^(@clientry/|@/)',
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ alwaysTryTypes: true, project }),
        ],
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        ...restrictedImports([SHARED_BY_FILE]),
      },
    },
    {
      files: ['src/features/**/*.{ts,tsx}'],
      rules: restrictedImports([SHARED_BY_FILE, ...ownPublicApi('features')]),
    },
    {
      files: ['src/entities/**/*.{ts,tsx}'],
      rules: restrictedImports([SHARED_BY_FILE, ...ownPublicApi('entities')]),
    },
    {
      files: LAYERED_FILES,
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': rootDir,
        'import/resolver': { [TYPESCRIPT_RESOLVER]: { alwaysTryTypes: true, project } },
        'boundaries/elements': ELEMENTS,
        'boundaries/files': FILE_CATEGORIES,
      },
      rules: {
        'boundaries/dependencies': ['error', { default: 'disallow', policies: LAYER_POLICIES }],
      },
    },
  );
}
