import { agent } from 'supertest';
import type { Agent, Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import {
  findSessionId,
  registerAccount,
  TEST_PASSWORD,
  uniqueEmail,
} from '../../../test/fixtures/accounts.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { refreshTokenHash, signAccessToken } from '../../../test/support/auth-tokens.js';
import { setCookies, setCookieValue } from '../../../test/support/set-cookies.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const REGISTRATION = {
  email: 'ann@studio.dev',
  password: TEST_PASSWORD,
  name: 'Ann',
  workspaceName: 'Pixel Studio',
};

function withoutRequestId(response: Response): Record<string, unknown> {
  const body = { ...apiProblemSchema.parse(response.body) };
  Reflect.deleteProperty(body, 'requestId');
  return body;
}

describe('auth API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function register(body: object = REGISTRATION): Promise<Response> {
    return send().post('/api/auth/register').send(body);
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

  describe('register', () => {
    it('should answer 201 with the session and the owner role when the body is valid', async () => {
      const response = await register();

      expect(response.status).toBe(201);
      expect(sessionResponseSchema.parse(response.body)).toMatchObject({
        user: { email: 'ann@studio.dev', name: 'Ann' },
        workspace: { name: 'Pixel Studio' },
        role: 'owner',
      });
    });

    it('should set both cookies with their attributes when the account is created', async () => {
      const cookies = setCookies(await register());

      expect(cookies.get(ACCESS_TOKEN_COOKIE)?.attributes).toEqual({
        'max-age': '1209600',
        path: '/',
        expires: expect.any(String) as string,
        httponly: true,
        samesite: 'Lax',
      });
      expect(cookies.get(REFRESH_TOKEN_COOKIE)?.attributes).toEqual({
        'max-age': '1209600',
        path: '/api/auth',
        expires: expect.any(String) as string,
        httponly: true,
        samesite: 'Strict',
      });
    });

    it('should store the workspace, owner membership and six stages when an account is registered', async () => {
      const response = await register();
      const { workspace } = sessionResponseSchema.parse(response.body);

      const memberships = await prisma.membership.findMany({
        where: { workspaceId: workspace.id },
      });
      const stages = await prisma.stage.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { position: 'asc' },
        select: { name: true, position: true, kind: true },
      });

      expect(await prisma.workspace.count()).toBe(1);
      expect(memberships.map(({ role }) => role)).toEqual(['owner']);
      expect(stages).toEqual([
        { name: 'New', position: 0, kind: 'open' },
        { name: 'Call', position: 1, kind: 'open' },
        { name: 'Proposal sent', position: 2, kind: 'open' },
        { name: 'Contract', position: 3, kind: 'open' },
        { name: 'Paid', position: 4, kind: 'won' },
        { name: 'Lost', position: 5, kind: 'lost' },
      ]);
    });

    it('should store an argon2id hash and only the refresh token hash when an account is registered', async () => {
      const response = await register();
      const refreshToken = setCookieValue(response, REFRESH_TOKEN_COOKIE);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: REGISTRATION.email } });
      const [stored] = await prisma.refreshToken.findMany();
      const storedHash = Buffer.from(stored?.tokenHash ?? []);

      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(storedHash.toString('base64url')).not.toBe(refreshToken);
      expect(storedHash.equals(refreshTokenHash(refreshToken))).toBe(true);
    });

    it('should answer 409 EMAIL_TAKEN when the email differs only in case and spaces', async () => {
      await register();

      const response = await register({ ...REGISTRATION, email: '  ANN@Studio.dev ' });

      expect(response.status).toBe(409);
      expect(apiProblemSchema.parse(response.body).code).toBe('EMAIL_TAKEN');
      expect(await prisma.workspace.count()).toBe(1);
    });

    it('should let only one succeed when two registrations race with one email', async () => {
      const responses = await Promise.all([register(), register()]);

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(await prisma.workspace.count()).toBe(1);
    });

    it('should answer 400 with both field errors when password and email are invalid', async () => {
      const response = await register({ ...REGISTRATION, email: 'ann@', password: 'short' });

      const problem = apiProblemSchema.parse(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors?.map(({ path }) => path).sort()).toEqual(['email', 'password']);
    });

    it('should answer 400 instead of failing the insert when the name holds a NUL character', async () => {
      const response = await register({ ...REGISTRATION, name: `Ann${String.fromCharCode(0)}` });

      const problem = apiProblemSchema.parse(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors?.map(({ path }) => path)).toEqual(['name']);
    });
  });

  describe('login', () => {
    it('should answer 200 with cookies and open a second session when credentials match', async () => {
      await register();

      const response = await send()
        .post('/api/auth/login')
        .send({ email: REGISTRATION.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect([...setCookies(response).keys()].sort()).toEqual([
        ACCESS_TOKEN_COOKIE,
        REFRESH_TOKEN_COOKIE,
      ]);
      expect(await prisma.session.count()).toBe(2);
    });

    it('should give the access cookie the Max-Age of the refresh cookie when credentials match', async () => {
      await register();

      const response = await send()
        .post('/api/auth/login')
        .send({ email: REGISTRATION.email, password: TEST_PASSWORD });
      const cookies = setCookies(response);

      expect(cookies.get(ACCESS_TOKEN_COOKIE)?.attributes['max-age']).toBe(
        cookies.get(REFRESH_TOKEN_COOKIE)?.attributes['max-age'],
      );
    });

    it('should answer the same 401 when the password is wrong or the email unknown', async () => {
      await register();

      const wrongPassword = await send()
        .post('/api/auth/login')
        .send({ email: REGISTRATION.email, password: 'wrong password' });
      const unknownEmail = await send()
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: 'wrong password' });

      const wrongPasswordBody = withoutRequestId(wrongPassword);
      const unknownEmailBody = withoutRequestId(unknownEmail);

      expect(wrongPassword.status).toBe(401);
      expect(wrongPasswordBody.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmailBody).toEqual(wrongPasswordBody);
    });
  });

  describe('me', () => {
    it('should answer 200 with the session when the access cookie is valid', async () => {
      const account = await registerAccount(testApp);

      const response = await account.http.get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(account.session);
    });

    it('should answer 401 AUTHENTICATION_REQUIRED when no access cookie is sent', async () => {
      await register();

      const me = await send().get('/api/auth/me');

      expect(me.status).toBe(401);
      expect(apiProblemSchema.parse(me.body).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should answer 401 AUTHENTICATION_REQUIRED when one character of the token is changed', async () => {
      const { accessToken } = await registerAccount(testApp);
      // Mid-signature: the last base64url character of a signature carries only padding bits.
      const index = accessToken.lastIndexOf('.') + 10;
      const replacement = accessToken[index] === 'A' ? 'B' : 'A';
      const tampered = `${accessToken.slice(0, index)}${replacement}${accessToken.slice(index + 1)}`;

      const me = await send()
        .get('/api/auth/me')
        .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${tampered}`);

      expect(me.status).toBe(401);
      expect(apiProblemSchema.parse(me.body).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should answer 401 AUTHENTICATION_REQUIRED when the access token has expired', async () => {
      const { session } = await registerAccount(testApp);
      const sid = await findSessionId(testApp, session.user.id);
      const expiresAt = Math.floor(Date.now() / 1000) - 60;
      const token = await signAccessToken(testApp, { session, sid, expiresAt });

      const me = await send().get('/api/auth/me').set('Cookie', `${ACCESS_TOKEN_COOKIE}=${token}`);

      expect(me.status).toBe(401);
      expect(apiProblemSchema.parse(me.body).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should answer 401 when the account was deleted after the token was issued', async () => {
      const account = await registerAccount(testApp);
      await prisma.user.delete({ where: { id: account.session.user.id } });

      const response = await account.http.get('/api/auth/me');

      expect(response.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('should answer 204 and clear both cookies with Max-Age=0 when a signed-in user logs out', async () => {
      const account = await registerAccount(testApp);

      const response = await account.http.post('/api/auth/logout');
      const cookies = setCookies(response);

      expect(response.status).toBe(204);
      expect(cookies.get(ACCESS_TOKEN_COOKIE)).toMatchObject({
        value: '',
        attributes: { 'max-age': '0', path: '/' },
      });
      expect(cookies.get(REFRESH_TOKEN_COOKIE)).toMatchObject({
        value: '',
        attributes: { 'max-age': '0', path: '/api/auth' },
      });
    });

    it('should make the old refresh cookie fail when the session was logged out', async () => {
      const response = await register();
      const refreshToken = setCookieValue(response, REFRESH_TOKEN_COOKIE);
      const cookie = `${REFRESH_TOKEN_COOKIE}=${refreshToken}`;

      await send().post('/api/auth/logout').set('Cookie', cookie).expect(204);
      const refresh = await send().post('/api/auth/refresh').set('Cookie', cookie);

      expect(refresh.status).toBe(401);
    });

    it('should answer 204 when no cookie is sent', async () => {
      const response = await send().post('/api/auth/logout');

      expect(response.status).toBe(204);
    });
  });

  describe('caching', () => {
    it.each([
      ['POST', '/api/auth/register'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/refresh'],
      ['POST', '/api/auth/logout'],
      ['GET', '/api/auth/me'],
    ])('should send Cache-Control no-store when %s %s answers', async (method, path) => {
      const response = await (method === 'GET' ? send().get(path) : send().post(path).send({}));

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
