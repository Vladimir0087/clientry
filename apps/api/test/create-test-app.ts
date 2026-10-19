import type { InjectionToken, ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { agent } from 'supertest';
import type { Agent } from 'supertest';
import { inject } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createApp } from '../src/configure-app.js';
import { TEST_APP_VERSION, TRUSTED_ORIGIN } from './support/test-env.js';
import { loadConfig } from '../src/infra/config/app-config.js';
import type { AppConfig } from '../src/infra/config/app-config.js';
import { createLogger } from '../src/infra/logger/create-logger.js';
import { DemoResetService } from '../src/modules/demo/demo-reset.service.js';

export const UNREACHABLE_DATABASE_URL = 'postgresql://clientry:clientry@127.0.0.1:1/clientry';
export const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';

export interface ProviderOverride {
  readonly token: InjectionToken;
  readonly value: unknown;
}

export interface TestAppOverrides {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly imports?: ModuleMetadata['imports'];
  readonly trustProxyHops?: number;
  // Off by default: fixtures register and log in far more often than the limits allow.
  readonly isRateLimited?: boolean;
  // Off by default: a background sweep would land in the SQL statement counts of other tests.
  readonly shouldRunJobs?: boolean;
  // Replaces providers, e.g. a writer that throws to prove a write rolls back.
  readonly providers?: readonly ProviderOverride[];
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
    JWT_PRIVATE_KEY: inject('jwtPrivateKey'),
    TRUSTED_ORIGINS: `${TRUSTED_ORIGIN},http://localhost:4000`,
    TRUST_PROXY_HOPS: String(overrides.trustProxyHops ?? 0),
    APP_VERSION: TEST_APP_VERSION,
  });
}

export async function createTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const config = createTestConfig(overrides);
  const builder = Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        config,
        logger: createLogger(config),
        shouldRunJobs: overrides.shouldRunJobs === true,
      }),
      ...(overrides.imports ?? []),
    ],
  });
  if (overrides.isRateLimited !== true) {
    builder.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  // The demo job's first tick would race the tests' TRUNCATE; demo tests reset it themselves.
  const demoReset: ProviderOverride[] =
    overrides.shouldRunJobs === true
      ? [{ token: DemoResetService, value: { reset: () => Promise.resolve() } }]
      : [];
  for (const { token, value } of [...demoReset, ...(overrides.providers ?? [])]) {
    builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = await createApp((adapter, options) =>
    moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
  );
  await app.listen(0, '127.0.0.1');
  return { app, http: agent(app.getHttpServer()) };
}
