import { agent } from 'supertest';
import type { Agent } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from './create-test-app.js';
import type { TestApp } from './create-test-app.js';
import { addManager, registerAccount, TEST_PASSWORD } from './fixtures/accounts.js';
import { resetDatabase } from './reset-database.js';
import { TRUSTED_ORIGIN } from './support/test-env.js';
import { TestOnlyModule } from './support/test-only.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

describe('access control', () => {
  let testApp: TestApp;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TestOnlyModule] });
  });

  beforeEach(async () => {
    await resetDatabase(testApp.app.get(PrismaService));
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('deny by default', () => {
    it('should answer 401 when a route without @Public() gets no cookie', async () => {
      const response = await send().get('/api/test/protected');

      expect(response.status).toBe(401);
      expect(apiProblemSchema.parse(response.body).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should answer 200 with the user when the route gets a valid cookie', async () => {
      const { http, session } = await registerAccount(testApp);

      const response = await http.get('/api/test/protected');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: session.user.id,
        workspaceId: session.workspace.id,
        role: 'owner',
      });
    });

    it('should keep the liveness probe open when no cookie is sent', async () => {
      const response = await send().get('/health/live');

      expect(response.status).toBe(200);
    });
  });

  describe('roles', () => {
    it('should answer 200 when the owner calls an owner-only route', async () => {
      const { http } = await registerAccount(testApp);

      const response = await http.get('/api/test/protected/owner');

      expect(response.status).toBe(200);
    });

    it('should answer 403 INSUFFICIENT_ROLE when a manager calls an owner-only route', async () => {
      const owner = await registerAccount(testApp);
      const manager = await addManager(testApp, owner.session.workspace.id);

      const response = await manager.http.get('/api/test/protected/owner');

      expect(manager.session.role).toBe('manager');
      expect(response.status).toBe(403);
      expect(apiProblemSchema.parse(response.body).code).toBe('INSUFFICIENT_ROLE');
    });
  });

  describe('tenant context', () => {
    it('should return each account its own workspace when two accounts exist', async () => {
      const first = await registerAccount(testApp, 'First Studio');
      const second = await registerAccount(testApp, 'Second Studio');

      const firstMe = await first.http.get('/api/auth/me');
      const secondMe = await second.http.get('/api/auth/me');

      expect(firstMe.body).toMatchObject({ workspace: first.session.workspace });
      expect(secondMe.body).toMatchObject({ workspace: second.session.workspace });
      expect(first.session.workspace.id).not.toBe(second.session.workspace.id);
    });
  });

  describe('origin check', () => {
    it.each(['https://evil.example', 'null'])(
      'should answer 403 UNTRUSTED_ORIGIN before validation when the origin is %s',
      async (origin) => {
        const response = await send()
          .post('/api/auth/login')
          .set('Origin', origin)
          .send({ email: 'not-an-email' });

        expect(response.status).toBe(403);
        expect(apiProblemSchema.parse(response.body).code).toBe('UNTRUSTED_ORIGIN');
      },
    );

    it('should answer normally when the origin is trusted', async () => {
      const { email } = await registerAccount(testApp);

      const response = await send()
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
    });

    it('should not block a GET when the origin is untrusted', async () => {
      const { http } = await registerAccount(testApp);

      const response = await http.get('/api/auth/me').set('Origin', 'https://evil.example');

      expect(response.status).toBe(200);
    });
  });
});
