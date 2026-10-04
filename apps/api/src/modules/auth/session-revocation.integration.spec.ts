import { agent } from 'supertest';
import type { Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { findSessionId, registerAccount } from '../../../test/fixtures/accounts.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { refreshTokenHash, signAccessToken } from '../../../test/support/auth-tokens.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

describe('session revocation', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  function getMe(accessToken: string): Test {
    return agent(testApp.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${accessToken}`);
  }

  function postWithRefresh(path: string, refreshToken: string): Test {
    return agent(testApp.app.getHttpServer())
      .post(path)
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${refreshToken}`);
  }

  function expectAuthenticationRequired(response: Response): void {
    expect(response.status).toBe(401);
    expect(apiProblemSchema.parse(response.body).code).toBe('AUTHENTICATION_REQUIRED');
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

  it('should reject the access token issued before logout when the session was logged out', async () => {
    const { accessToken, refreshToken } = await registerAccount(testApp);
    await getMe(accessToken).expect(200);

    await postWithRefresh('/api/auth/logout', refreshToken).expect(204);

    expectAuthenticationRequired(await getMe(accessToken));
  });

  it('should reject the access token of the session when refresh token reuse is detected', async () => {
    const { accessToken, refreshToken } = await registerAccount(testApp);
    await postWithRefresh('/api/auth/refresh', refreshToken).expect(200);
    await prisma.refreshToken.update({
      where: { tokenHash: refreshTokenHash(refreshToken) },
      data: { rotatedAt: new Date(Date.now() - 31_000) },
    });

    await postWithRefresh('/api/auth/refresh', refreshToken).expect(401);

    expectAuthenticationRequired(await getMe(accessToken));
  });

  it('should reject the access token when its session has passed its absolute end', async () => {
    const { accessToken } = await registerAccount(testApp);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expectAuthenticationRequired(await getMe(accessToken));
  });

  it('should accept a token signed for the user’s own session when sid matches the user', async () => {
    const { session } = await registerAccount(testApp);
    const sid = await findSessionId(testApp, session.user.id);
    const token = await signAccessToken(testApp, { session, sid });

    const response = await getMe(token);

    expect(response.status).toBe(200);
  });

  it('should reject the access token when its sid belongs to another user’s session', async () => {
    const first = await registerAccount(testApp);
    const second = await registerAccount(testApp);
    const sid = await findSessionId(testApp, second.session.user.id);
    const token = await signAccessToken(testApp, { session: first.session, sid });

    expectAuthenticationRequired(await getMe(token));
  });
});
