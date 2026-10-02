import { afterEach, describe, expect, it } from 'vitest';

import { readinessProblemSchema } from '@clientry/shared/health';

import {
  createTestApp,
  UNREACHABLE_DATABASE_URL,
  UNREACHABLE_REDIS_URL,
} from '../../../test/create-test-app.js';
import type { TestApp, TestAppOverrides } from '../../../test/create-test-app.js';

describe('HealthController', () => {
  let testApp: TestApp | undefined;

  async function start(overrides?: TestAppOverrides): Promise<TestApp> {
    testApp = await createTestApp(overrides);
    return testApp;
  }

  afterEach(async () => {
    await testApp?.app.close();
    testApp = undefined;
  });

  it('should answer 200 when liveness is probed', async () => {
    const { http } = await start();

    const response = await http.get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('should answer 200 with both checks up when dependencies are reachable', async () => {
    const { http } = await start();

    const response = await http.get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it.each([
    ['Valkey', { redisUrl: UNREACHABLE_REDIS_URL }, { database: 'up', redis: 'down' }],
    ['Postgres', { databaseUrl: UNREACHABLE_DATABASE_URL }, { database: 'down', redis: 'up' }],
  ])(
    'should boot and report not ready when %s is unreachable',
    async (_name, overrides, checks) => {
      const { http } = await start(overrides);

      const live = await http.get('/health/live');
      const ready = await http.get('/health/ready');

      expect(live.status).toBe(200);
      expect(ready.status).toBe(503);
      expect(ready.type).toBe('application/problem+json');
      expect(readinessProblemSchema.parse(ready.body)).toMatchObject({ code: 'NOT_READY', checks });
    },
  );
});
