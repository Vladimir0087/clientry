import { Agent } from 'node:http';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, createTestConfig } from './create-test-app.js';
import { TestOnlyController } from './support/test-only.controller.js';
import { TestOnlyModule } from './support/test-only.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

// Well under Node's default keepAliveTimeout of 5 s, which an unswept connection would wait out.
const MAX_CLOSE_MS = 2000;

interface ConnectionCount {
  readonly count: number;
}

describe('graceful shutdown', () => {
  let postgresObserver: PrismaService;
  let valkeyObserver: Redis;

  async function countPostgresClients(): Promise<number> {
    const [row] = await postgresObserver.$queryRaw<ConnectionCount[]>`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database()
        AND backend_type = 'client backend'
        AND pid <> pg_backend_pid()`;
    return row?.count ?? 0;
  }

  async function countValkeyClients(): Promise<number> {
    const list = await valkeyObserver.client('LIST');
    if (typeof list !== 'string') {
      throw new TypeError('CLIENT LIST returned a non-string reply');
    }
    // The observer's own connection is always listed.
    return list.trim().split('\n').length - 1;
  }

  beforeAll(async () => {
    const config = createTestConfig();
    postgresObserver = new PrismaService(config);
    valkeyObserver = new Redis(config.redisUrl);
    await postgresObserver.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await postgresObserver.$disconnect();
    await valkeyObserver.quit();
  });

  it('should finish in-flight requests and then close connections when the app closes', async () => {
    const { app, http } = await createTestApp({ imports: [TestOnlyModule] });
    await http.get('/health/ready');
    // supertest sends on then(); the handler signals once it runs, so close() hits it mid-flight.
    const inFlight = http.get('/api/test/slow').then((response) => response);
    await app.get(TestOnlyController).whenSlowRequestEntered();

    await app.close();
    const response = await inFlight;

    expect(response.status).toBe(200);
    await expect.poll(countPostgresClients).toBe(0);
    await expect.poll(countValkeyClients).toBe(0);
  });

  it('should close a keep-alive connection right after its request when the app closes', async () => {
    const { app, http } = await createTestApp({ imports: [TestOnlyModule] });
    const keepAlive = new Agent({ keepAlive: true });
    try {
      const inFlight = http
        .get('/api/test/slow')
        .agent(keepAlive)
        .then((response) => response);
      await app.get(TestOnlyController).whenSlowRequestEntered();

      const startedAt = performance.now();
      await app.close();
      const closeMs = performance.now() - startedAt;
      const response = await inFlight;

      expect(response.status).toBe(200);
      expect(closeMs).toBeLessThan(MAX_CLOSE_MS);
    } finally {
      keepAlive.destroy();
    }
  });
});
