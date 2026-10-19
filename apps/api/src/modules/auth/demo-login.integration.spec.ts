import { agent } from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount, TEST_PASSWORD } from '../../../test/fixtures/accounts.js';
import { resetDemo } from '../../../test/fixtures/demo.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { setCookieValue } from '../../../test/support/set-cookies.js';
import { TRUSTED_ORIGIN } from '../../../test/support/test-env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { DEMO_WORKSPACE, PEOPLE } from '../demo/data/people.js';

function codeOf(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

describe('demo login', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  function startDemo(body: unknown, origin = TRUSTED_ORIGIN): Promise<Response> {
    return agent(testApp.app.getHttpServer())
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send(body as object);
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('with the demo built', () => {
    beforeEach(async () => {
      await resetDemo(testApp);
    });

    it("should start Ann's session in the demo with both cookies when the owner entry is pressed", async () => {
      const response = await startDemo({ role: 'owner' });

      expect(response.status).toBe(200);
      expect(sessionResponseSchema.parse(response.body)).toEqual({
        user: { id: PEOPLE.ann.id, email: PEOPLE.ann.email, name: 'Ann Carter' },
        workspace: { id: DEMO_WORKSPACE.id, name: 'Pixel Studio', isDemo: true },
        role: 'owner',
      });
      expect(setCookieValue(response, ACCESS_TOKEN_COOKIE)).not.toBe('');
      expect(setCookieValue(response, REFRESH_TOKEN_COOKIE)).not.toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it("should start Max's session as a manager when the manager entry is pressed", async () => {
      const response = await startDemo({ role: 'manager' });

      expect(response.status).toBe(200);
      expect(sessionResponseSchema.parse(response.body)).toMatchObject({
        user: { id: PEOPLE.max.id, name: 'Max Novak' },
        workspace: { isDemo: true },
        role: 'manager',
      });
    });

    it('should give each press a session of its own when two visitors enter as the owner', async () => {
      await startDemo({ role: 'owner' });
      await startDemo({ role: 'owner' });

      expect(await prisma.session.count({ where: { userId: PEOPLE.ann.id } })).toBe(2);
    });

    it('should answer 400 on role when the role is not owner or manager', async () => {
      const response = await startDemo({ role: 'admin' });

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors?.map(({ path }) => path)).toEqual([
        'role',
      ]);
    });

    it('should answer 403 UNTRUSTED_ORIGIN when the request comes from an untrusted origin', async () => {
      const response = await startDemo({ role: 'owner' }, 'https://evil.example');

      expect(response.status).toBe(403);
      expect(codeOf(response)).toBe('UNTRUSTED_ORIGIN');
    });

    it.each([PEOPLE.ann.email, PEOPLE.max.email])(
      'should answer 401 INVALID_CREDENTIALS when %s logs in with a password',
      async (email) => {
        const response = await agent(testApp.app.getHttpServer())
          .post('/api/auth/login')
          .send({ email, password: TEST_PASSWORD });

        expect(response.status).toBe(401);
        expect(codeOf(response)).toBe('INVALID_CREDENTIALS');
      },
    );
  });

  it('should answer 503 DEMO_UNAVAILABLE and start no session when the demo is not built yet', async () => {
    const response = await startDemo({ role: 'owner' });

    expect(response.status).toBe(503);
    expect(codeOf(response)).toBe('DEMO_UNAVAILABLE');
    expect(await prisma.session.count()).toBe(0);
  });

  describe('registered accounts', () => {
    it('should report isDemo false in register, login, me and refresh when the account is registered', async () => {
      const owner = await registerAccount(testApp);
      const login = await agent(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password: TEST_PASSWORD })
        .expect(200);
      const me = await owner.http.get('/api/auth/me').expect(200);
      const refresh = await owner.http
        .post('/api/auth/refresh')
        .set('Origin', TRUSTED_ORIGIN)
        .expect(200);

      for (const body of [login.body, me.body, refresh.body]) {
        expect(sessionResponseSchema.parse(body).workspace.isDemo).toBe(false);
      }
      expect(owner.session.workspace.isDemo).toBe(false);
    });

    it('should report isDemo false when a manager joins by invite', async () => {
      const owner = await registerAccount(testApp);

      const manager = await addManager(testApp, owner.session.workspace.id);

      expect(manager.session.workspace.isDemo).toBe(false);
    });
  });
});
