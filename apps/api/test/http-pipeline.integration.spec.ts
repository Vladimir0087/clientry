import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from './create-test-app.js';
import type { TestApp } from './create-test-app.js';
import { TestOnlyModule } from './support/test-only.module.js';

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

describe('HTTP pipeline', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TestOnlyModule] });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('request id', () => {
    it('should echo the header when the client sends a valid one', async () => {
      const response = await testApp.http.get('/health/live').set('X-Request-Id', 'client-req-1');

      expect(response.headers['x-request-id']).toBe('client-req-1');
    });

    it('should generate an id when the client sends none', async () => {
      const response = await testApp.http.get('/health/live');

      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });
  });

  describe('security headers', () => {
    it('should send the default security headers when any response is written', async () => {
      const response = await testApp.http.get('/api/unknown');

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
      });
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should not upgrade insecure requests when the content security policy is sent', async () => {
      const response = await testApp.http.get('/health/live');

      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    });
  });

  describe('errors', () => {
    it.each(['/api/unknown?page=2', '/unknown'])(
      'should answer 404 problem details when %s does not exist',
      async (path) => {
        const response = await testApp.http.get(path);

        expect(response.status).toBe(404);
        expect(response.type).toBe('application/problem+json');
        expect(apiProblemSchema.parse(response.body)).toMatchObject({
          code: 'NOT_FOUND',
          instance: path.split('?')[0],
          requestId: response.headers['x-request-id'],
        });
      },
    );

    it('should answer 400 without quoting the body when the JSON is malformed', async () => {
      const response = await testApp.http
        .post('/api/test/echo')
        .set('Content-Type', 'application/json')
        .send('{"email":"a@b.co","password":hunter2}');

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body)).toMatchObject({
        code: 'BAD_REQUEST',
        detail: 'Malformed JSON body',
        requestId: response.headers['x-request-id'],
      });
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });

    it('should answer 413 problem details when the body exceeds the parser limit', async () => {
      const response = await testApp.http
        .post('/api/test/echo')
        .send({ name: 'x'.repeat(200_000), email: 'a@b.co' });

      expect(response.status).toBe(413);
      expect(apiProblemSchema.parse(response.body)).toMatchObject({
        code: 'PAYLOAD_TOO_LARGE',
        requestId: response.headers['x-request-id'],
      });
    });

    it('should answer 500 without internals when a handler throws an unknown error', async () => {
      const response = await testApp.http.get('/api/test/crash');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        detail: 'An unexpected error occurred',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/hunter2|stack|at /);
    });
  });

  describe('validation and serialization', () => {
    it('should answer 400 with field errors when the body is invalid', async () => {
      const response = await testApp.http
        .post('/api/test/echo')
        .send({ name: '', email: 'not-an-email' });

      const problem = apiProblemSchema.parse(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_FAILED');
      expect(problem.errors?.map(({ path }) => path)).toEqual(['name', 'email']);
    });

    it('should pass the parsed body without unknown keys when the body is valid', async () => {
      const response = await testApp.http
        .post('/api/test/echo')
        .send({ name: 'Ann', email: 'ann@example.com', role: 'owner' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: { name: 'Ann', email: 'ann@example.com' } });
    });

    it('should drop fields outside the response schema when a handler returns them', async () => {
      const response = await testApp.http.get('/api/test/leaky');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'user-1' });
    });

    it('should parse the whole list when the response schema is an array', async () => {
      const response = await testApp.http.get('/api/test/users');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 'user-1' }, { id: 'user-2' }]);
    });

    it('should answer with the declared status when the response schema sets one', async () => {
      const response = await testApp.http.post('/api/test/users');

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 'user-3' });
    });

    it('should answer 500 when a primitive body does not match the response schema', async () => {
      const response = await testApp.http.get('/api/test/primitive');

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('user-1');
    });

    it('should answer 500 when a handler returns a body without a response schema', async () => {
      const response = await testApp.http.get('/api/test/no-schema');

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('user-1');
    });
  });
});
