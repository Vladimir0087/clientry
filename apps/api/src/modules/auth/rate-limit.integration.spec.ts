import { agent } from 'supertest';
import type { Test } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { uniqueEmail } from '../../../test/fixtures/accounts.js';

const LOGIN_LIMIT = 10;
const PREVIEW_LIMIT = 30;
const UNKNOWN_TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';

// Each test gets its own app: the throttler counts in memory for the life of the app.
describe('auth rate limit', () => {
  let testApp: TestApp | undefined;

  async function startApp(trustProxyHops: number): Promise<TestApp> {
    testApp = await createTestApp({ isRateLimited: true, trustProxyHops });
    return testApp;
  }

  function failLogin(app: TestApp, forwardedFor?: string): Test {
    const call = agent(app.app.getHttpServer()).post('/api/auth/login');
    if (forwardedFor !== undefined) {
      call.set('X-Forwarded-For', forwardedFor);
    }
    return call.send({ email: uniqueEmail(), password: 'wrong password' });
  }

  async function exhaustLogins(app: TestApp, forwardedFor?: string): Promise<void> {
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      await failLogin(app, forwardedFor).expect(401);
    }
  }

  afterEach(async () => {
    await testApp?.app.close();
    testApp = undefined;
  });

  it('should answer 429 with Retry-After when the 11th login comes within a minute', async () => {
    const app = await startApp(0);
    await exhaustLogins(app);

    const response = await failLogin(app);

    expect(response.status).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(apiProblemSchema.parse(response.body)).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      detail: 'Too many requests, try again later',
    });
  });

  it('should count forwarded addresses apart when one proxy hop is trusted', async () => {
    const app = await startApp(1);
    await exhaustLogins(app, '203.0.113.1');

    const response = await failLogin(app, '203.0.113.2');

    expect(response.status).toBe(401);
  });

  it('should ignore X-Forwarded-For when no proxy hop is trusted', async () => {
    const app = await startApp(0);
    await exhaustLogins(app, '203.0.113.1');

    const response = await failLogin(app, '203.0.113.2');

    expect(response.status).toBe(429);
  });

  it('should answer 429 with Retry-After when the 31st invite preview comes within a minute', async () => {
    const app = await startApp(0);
    const http = agent(app.app.getHttpServer());
    for (let attempt = 0; attempt < PREVIEW_LIMIT; attempt += 1) {
      await http.post('/api/auth/invite/preview').send({ token: UNKNOWN_TOKEN }).expect(404);
    }

    const response = await http.post('/api/auth/invite/preview').send({ token: UNKNOWN_TOKEN });

    expect(response.status).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('should answer 429 when the 11th login by invite comes within a minute', async () => {
    const app = await startApp(0);
    const http = agent(app.app.getHttpServer());
    const body = { token: UNKNOWN_TOKEN, email: uniqueEmail(), password: 'wrong password' };
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      await http.post('/api/auth/invite/login').send(body).expect(404);
    }

    const response = await http.post('/api/auth/invite/login').send(body);

    expect(response.status).toBe(429);
  });
});
