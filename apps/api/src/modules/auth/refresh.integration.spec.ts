import { decodeJwt } from 'jose';
import { agent } from 'supertest';
import type { Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { registerAccount } from '../../../test/fixtures/accounts.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { opaqueTokenHash } from '../../../test/support/auth-tokens.js';
import { setCookies, setCookieValue } from '../../../test/support/set-cookies.js';
import { TestOnlyModule } from '../../../test/support/test-only.module.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('refresh API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  function refresh(token: string): Test {
    return agent(testApp.app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${token}`);
  }

  function expectProblem(response: Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    expect(apiProblemSchema.parse(response.body).code).toBe(code);
  }

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TestOnlyModule] });
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should replace both cookies with a new refresh value when the token is fresh', async () => {
    const { refreshToken } = await registerAccount(testApp);

    const response = await refresh(refreshToken);
    const cookies = setCookies(response);

    expect(response.status).toBe(200);
    expect(cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBeTruthy();
    expect(cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBeTruthy();
    expect(cookies.get(REFRESH_TOKEN_COOKIE)?.value).not.toBe(refreshToken);
  });

  it('should give the access cookie the Max-Age of the refresh cookie when the token is fresh', async () => {
    const { refreshToken } = await registerAccount(testApp);

    const cookies = setCookies(await refresh(refreshToken));

    expect(cookies.get(ACCESS_TOKEN_COOKIE)?.attributes['max-age']).toBe(
      cookies.get(REFRESH_TOKEN_COOKIE)?.attributes['max-age'],
    );
  });

  it('should answer 200 when the previous token is replayed at once', async () => {
    const { refreshToken } = await registerAccount(testApp);
    await refresh(refreshToken).expect(200);

    const replay = await refresh(refreshToken);

    expect(replay.status).toBe(200);
  });

  it('should revoke the session when the previous token is replayed after the grace period', async () => {
    const { refreshToken } = await registerAccount(testApp);
    const newest = setCookieValue(await refresh(refreshToken).expect(200), REFRESH_TOKEN_COOKIE);
    await prisma.refreshToken.update({
      where: { tokenHash: opaqueTokenHash(refreshToken) },
      data: { rotatedAt: new Date(Date.now() - 31_000) },
    });

    const replay = await refresh(refreshToken);
    const afterReuse = await refresh(newest);

    expectProblem(replay, 401, 'INVALID_REFRESH_TOKEN');
    expect(setCookies(replay).get(REFRESH_TOKEN_COOKIE)?.attributes['max-age']).toBe('0');
    expect(setCookies(replay).get(ACCESS_TOKEN_COOKIE)?.attributes['max-age']).toBe('0');
    expect(await prisma.session.count({ where: { revokedAt: { not: null } } })).toBe(1);
    expectProblem(afterReuse, 401, 'INVALID_REFRESH_TOKEN');
  });

  it('should answer 401 when the session has ended', async () => {
    const { refreshToken } = await registerAccount(testApp);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expectProblem(await refresh(refreshToken), 401, 'INVALID_REFRESH_TOKEN');
  });

  it('should answer 401 when the token has been idle for 14 days', async () => {
    const { refreshToken } = await registerAccount(testApp);
    await prisma.refreshToken.update({
      where: { tokenHash: opaqueTokenHash(refreshToken) },
      data: { createdAt: new Date(Date.now() - 14 * DAY_MS) },
    });

    expectProblem(await refresh(refreshToken), 401, 'INVALID_REFRESH_TOKEN');
  });

  it('should answer 401 when no refresh cookie is sent', async () => {
    const response = await agent(testApp.app.getHttpServer()).post('/api/auth/refresh');

    expectProblem(response, 401, 'INVALID_REFRESH_TOKEN');
  });

  it('should answer 200 to both when two refreshes race with one token', async () => {
    const { refreshToken } = await registerAccount(testApp);

    const responses = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
  });

  describe('when the membership changes', () => {
    async function demoteToManager(userId: string): Promise<void> {
      await prisma.membership.updateMany({ where: { userId }, data: { role: 'manager' } });
    }

    it('should answer 403 on an owner-only route with the same access token when the role changed', async () => {
      const account = await registerAccount(testApp);
      await demoteToManager(account.session.user.id);

      const response = await account.http.get('/api/test/protected/owner');

      expectProblem(response, 403, 'INSUFFICIENT_ROLE');
    });

    it('should return and sign the new role on the next refresh when the role changed', async () => {
      const account = await registerAccount(testApp);
      await demoteToManager(account.session.user.id);

      const response = await account.http.post('/api/auth/refresh');
      const claims = decodeJwt(setCookieValue(response, ACCESS_TOKEN_COOKIE));

      expect(sessionResponseSchema.parse(response.body).role).toBe('manager');
      expect(claims.role).toBe('manager');
    });

    it('should answer 401 with the same access token when the membership was deleted', async () => {
      const account = await registerAccount(testApp);
      await prisma.membership.deleteMany({ where: { userId: account.session.user.id } });

      const response = await account.http.get('/api/test/protected');

      expectProblem(response, 401, 'AUTHENTICATION_REQUIRED');
    });

    it('should answer 401 on refresh and revoke the session when the membership was deleted', async () => {
      const { refreshToken, session } = await registerAccount(testApp);
      await prisma.membership.deleteMany({ where: { userId: session.user.id } });

      const response = await refresh(refreshToken);

      expectProblem(response, 401, 'INVALID_REFRESH_TOKEN');
      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    });
  });
});
