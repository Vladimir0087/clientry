import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { ValkeyContainer } from '@testcontainers/valkey';
import type { TestProject } from 'vitest/node';

import {
  generateSigningKeyPem,
  POSTGRES_IMAGE,
  SERVER_TIME_ZONE,
  VALKEY_IMAGE,
} from './support/test-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    jwtPrivateKey: string;
  }
}

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
    // Neon's locale: byte order, so only an explicit collation sorts names and tags by language.
    // A zone behind UTC: a connection without the pool's TimeZone would shift every stored moment.
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withEnvironment({ POSTGRES_INITDB_ARGS: '--locale=C.UTF-8' })
      .withCommand(['postgres', '-c', `timezone=${SERVER_TIME_ZONE}`])
      .start(),
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
