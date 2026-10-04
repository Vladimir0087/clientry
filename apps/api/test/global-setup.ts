import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { ValkeyContainer } from '@testcontainers/valkey';
import type { TestProject } from 'vitest/node';

import { generateSigningKeyPem } from './support/test-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    jwtPrivateKey: string;
  }
}

// The same images as compose.yaml.
const POSTGRES_IMAGE = 'postgres:18';
const VALKEY_IMAGE = 'valkey/valkey:8.1';

const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRISMA_CLI = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));

const execFileAsync = promisify(execFile);

async function prisma(args: readonly string[], databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [postgres, valkey] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new ValkeyContainer(VALKEY_IMAGE).start(),
  ]);
  const databaseUrl = postgres.getConnectionUri().replace(/^postgres:/, 'postgresql:');

  await prisma(['migrate', 'deploy'], databaseUrl);
  // Exit code 2 means drift: schema.prisma changed without a migration.
  await prisma(
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    databaseUrl,
  );

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', valkey.getConnectionUrl());
  project.provide('jwtPrivateKey', generateSigningKeyPem());

  return async () => {
    await Promise.all([postgres.stop(), valkey.stop()]);
  };
}
