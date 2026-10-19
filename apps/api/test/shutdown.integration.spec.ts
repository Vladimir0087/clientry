import { Agent } from 'node:http';

import { Logger } from '@nestjs/common';
import { ValkeyContainer } from '@testcontainers/valkey';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, createTestConfig, UNREACHABLE_REDIS_URL } from './create-test-app.js';
import { registerAccount } from './fixtures/accounts.js';
import { createTask } from './fixtures/tasks.js';
import { resetDatabase } from './reset-database.js';
import { VALKEY_IMAGE } from './support/test-env.js';
import { TestOnlyController } from './support/test-only.controller.js';
import { TestOnlyModule } from './support/test-only.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { SHUTDOWN_DEADLINE_MS } from '../src/process-handlers.js';

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

  it('should close the queue and worker connections too when an app running jobs closes', async () => {
    const { app, http } = await createTestApp({ shouldRunJobs: true });
    await http.get('/health/ready');
    // Each worker holds two connections and each queue one.
    await expect.poll(countValkeyClients).toBe(10);

    await app.close();

    await expect.poll(countPostgresClients).toBe(0);
    await expect.poll(countValkeyClients).toBe(0);
  });

  it('should start, take writes and close in time when Valkey is unreachable and jobs run', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const testApp = await createTestApp({ shouldRunJobs: true, redisUrl: UNREACHABLE_REDIS_URL });
    try {
      await resetDatabase(testApp.app.get(PrismaService));
      await testApp.http.get('/health/live').expect(200);
      const account = await registerAccount(testApp);

      const task = await createTask(account.http, {
        title: 'Call Romashka',
        dueAt: '2030-03-15T12:00:00.000Z',
        remindAt: new Date(Date.now() + 60_000).toISOString(),
        assigneeId: account.session.user.id,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: task.id }),
        'Could not queue a reminder',
      );
    } finally {
      const startedAt = performance.now();
      await testApp.app.close();
      expect(performance.now() - startedAt).toBeLessThan(SHUTDOWN_DEADLINE_MS);
      warnSpy.mockRestore();
    }
  });

  it('should close in time when Valkey goes away while jobs run', async () => {
    const valkey = await new ValkeyContainer(VALKEY_IMAGE).start();
    const redisUrl = valkey.getConnectionUrl();
    const testApp = await createTestApp({ shouldRunJobs: true, redisUrl });
    try {
      const watcher = new Redis(redisUrl);
      // Every worker waits for jobs, so their connections are ready.
      await expect
        .poll(async () => String(await watcher.client('LIST')).split('cmd=bzpopmin').length - 1)
        .toBe(3);
      await watcher.quit();
      await valkey.stop();
      await resetDatabase(testApp.app.get(PrismaService));
      const account = await registerAccount(testApp);
      await createTask(account.http, {
        title: 'Call Romashka',
        dueAt: '2030-03-15T12:00:00.000Z',
        remindAt: new Date(Date.now() + 60_000).toISOString(),
        assigneeId: account.session.user.id,
      });
    } finally {
      const startedAt = performance.now();
      await testApp.app.close();
      expect(performance.now() - startedAt).toBeLessThan(SHUTDOWN_DEADLINE_MS);
    }
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
