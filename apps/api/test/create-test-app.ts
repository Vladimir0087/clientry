import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { agent } from 'supertest';
import type { Agent } from 'supertest';
import { inject } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createApp } from '../src/configure-app.js';
import { loadConfig } from '../src/infra/config/app-config.js';
import type { AppConfig } from '../src/infra/config/app-config.js';
import { createLogger } from '../src/infra/logger/create-logger.js';

export const UNREACHABLE_DATABASE_URL = 'postgresql://clientry:clientry@127.0.0.1:1/clientry';
export const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';

export interface TestAppOverrides {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly imports?: ModuleMetadata['imports'];
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly http: Agent;
}

export function createTestConfig(overrides: TestAppOverrides = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: overrides.databaseUrl ?? inject('databaseUrl'),
    REDIS_URL: overrides.redisUrl ?? inject('redisUrl'),
  });
}

export async function createTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const config = createTestConfig(overrides);
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({ config, logger: createLogger(config) }),
      ...(overrides.imports ?? []),
    ],
  }).compile();
  const app = await createApp((adapter, options) =>
    moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
  );
  await app.listen(0, '127.0.0.1');
  return { app, http: agent(app.getHttpServer()) };
}
