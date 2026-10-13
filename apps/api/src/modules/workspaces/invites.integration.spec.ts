import { randomBytes } from 'node:crypto';

import { agent } from 'supertest';
import type { Agent, Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REFRESH_TOKEN_COOKIE, sessionResponseSchema } from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';
import {
  createdInviteResponseSchema,
  INVITE_LIMITS,
  inviteListResponseSchema,
} from '@clientry/shared/workspaces';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import {
  addManager,
  registerAccount,
  TEST_PASSWORD,
  uniqueEmail,
} from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createInvite, expireInvite, markInviteUsed } from '../../../test/fixtures/invites.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { opaqueTokenHash } from '../../../test/support/auth-tokens.js';
import { holdTransaction, waitForLockWaiter } from '../../../test/support/held-transaction.js';
import { setCookies } from '../../../test/support/set-cookies.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';

const UNKNOWN_TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';

function codeOf(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

describe('invites API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let stranger: TestAccount;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function preview(token: string): Test {
    return send().post('/api/auth/invite/preview').send({ token });
  }

  function registerByInvite(http: Agent, token: string, email = uniqueEmail('max')): Test {
    return http
      .post('/api/auth/invite/register')
      .send({ token, email, password: TEST_PASSWORD, name: 'Max' });
  }

  function loginByInvite(token: string, email: string, password = TEST_PASSWORD): Test {
    return send().post('/api/auth/invite/login').send({ token, email, password });
  }

  async function revoke(id: string): Promise<void> {
    await owner.http.delete(`/api/invites/${id}`).expect(204);
  }

  async function listedIds(account: TestAccount): Promise<string[]> {
    const response = await account.http.get('/api/invites').expect(200);
    return inviteListResponseSchema.parse(response.body).items.map(({ id }) => id);
  }

  // Inserted directly: twenty requests per test would only slow the suite down.
  async function insertPending(count: number): Promise<void> {
    await prisma.invite.createMany({
      data: Array.from({ length: count }, () => ({
        workspaceId: owner.session.workspace.id,
        createdById: owner.session.user.id,
        tokenHash: Uint8Array.from(randomBytes(32)),
        expiresAt: new Date(Date.now() + INVITE_LIMITS.lifetimeMs),
      })),
    });
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('create and list', () => {
    it('should answer 201 and store only a hash different from the token when an invite is created', async () => {
      const response = await owner.http.post('/api/invites');

      expect(response.status).toBe(201);
      const created = createdInviteResponseSchema.parse(response.body);
      expect(created.createdBy).toEqual({ id: owner.session.user.id, name: 'Ann' });
      const row = await prisma.invite.findUniqueOrThrow({ where: { id: created.id } });
      const stored = Buffer.from(row.tokenHash);
      expect(stored.equals(Buffer.from(opaqueTokenHash(created.token)))).toBe(true);
      expect(stored.toString('base64url')).not.toBe(created.token);
    });

    it('should list only the own workspace pending invites newest first without tokens when an owner asks', async () => {
      const used = await createInvite(owner);
      const revoked = await createInvite(owner);
      const expired = await createInvite(owner);
      const older = await createInvite(owner);
      const newer = await createInvite(owner);
      await createInvite(stranger);
      await markInviteUsed(testApp, used.id);
      await revoke(revoked.id);
      await expireInvite(testApp, expired.id);

      const response = await owner.http.get('/api/invites').expect(200);

      const { items } = inviteListResponseSchema.parse(response.body);
      expect(items.map(({ id }) => id)).toEqual([newer.id, older.id]);
      expect(JSON.stringify(response.body)).not.toContain(newer.token);
    });

    it('should answer 409 INVITE_LIMIT_REACHED when a 21st invite would be pending', async () => {
      await insertPending(INVITE_LIMITS.pending);

      const response = await owner.http.post('/api/invites');

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('INVITE_LIMIT_REACHED');
      expect(await prisma.invite.count()).toBe(INVITE_LIMITS.pending);
    });

    it('should answer 204 and stop the link when an invite is revoked', async () => {
      const { id, token } = await createInvite(owner);

      await revoke(id);

      expect((await preview(token)).status).toBe(404);
      expect(await listedIds(owner)).toEqual([]);
    });

    it('should answer 404 INVITE_NOT_FOUND when the invite is used, revoked or another workspace’s', async () => {
      const used = await createInvite(owner);
      const revoked = await createInvite(owner);
      const foreign = await createInvite(stranger);
      await markInviteUsed(testApp, used.id);
      await revoke(revoked.id);

      const responses = await Promise.all(
        [used, revoked, foreign].map(({ id }) => owner.http.delete(`/api/invites/${id}`)),
      );

      expect(responses.map(({ status }) => status)).toEqual([404, 404, 404]);
      expect(responses.map(codeOf)).toEqual(Array.from({ length: 3 }, () => 'INVITE_NOT_FOUND'));
      expect((await preview(foreign.token)).status).toBe(200);
    });

    it('should answer 400 on id when the invite id is not a UUID', async () => {
      const response = await owner.http.delete('/api/invites/not-a-uuid');

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors?.map(({ path }) => path)).toEqual(['id']);
    });

    it('should send Cache-Control no-store when any invites route answers, errors included', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const created = await owner.http.post('/api/invites');
      const listed = await owner.http.get('/api/invites');
      const forbidden = await manager.http.get('/api/invites');
      const createdId = createdInviteResponseSchema.parse(created.body).id;
      const revoked = await owner.http.delete(`/api/invites/${createdId}`);
      const missing = await owner.http.delete(`/api/invites/${createdId}`);
      const malformed = await owner.http.delete('/api/invites/not-a-uuid');
      await insertPending(INVITE_LIMITS.pending);
      const conflict = await owner.http.post('/api/invites');
      const responses = [created, listed, forbidden, revoked, missing, malformed, conflict];

      expect(responses.map(({ status }) => status)).toEqual([201, 200, 403, 204, 404, 400, 409]);
      for (const response of responses) {
        expect(response.headers['cache-control']).toBe('no-store');
      }
    });
  });

  describe('preview', () => {
    it('should answer 200 with the workspace, inviter and expiry when the invite is pending', async () => {
      const created = createdInviteResponseSchema.parse(
        (await owner.http.post('/api/invites').expect(201)).body,
      );

      const response = await preview(created.token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        workspace: { name: 'Pixel Studio' },
        invitedBy: { name: 'Ann' },
        expiresAt: created.expiresAt,
      });
    });

    it('should answer identical 404 INVITE_INVALID bodies when the token is unknown, used, revoked or expired', async () => {
      const used = await createInvite(owner);
      const revoked = await createInvite(owner);
      const expired = await createInvite(owner);
      await markInviteUsed(testApp, used.id);
      await revoke(revoked.id);
      await expireInvite(testApp, expired.id);

      const responses = await Promise.all(
        [UNKNOWN_TOKEN, used.token, revoked.token, expired.token].map((token) => preview(token)),
      );

      expect(responses.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
      const bodies = responses.map(({ body }) => ({
        ...apiProblemSchema.parse(body),
        requestId: undefined,
      }));
      expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
      expect(bodies[0]?.code).toBe('INVITE_INVALID');
    });

    it('should answer 400 on token when the token is malformed', async () => {
      const response = await preview('too-short');

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'token', message: 'Invalid invite link' },
      ]);
    });
  });

  describe('register by invite', () => {
    it('should answer 201 with both cookies and the manager role in the invite workspace when a new account joins', async () => {
      const { id, token } = await createInvite(owner);
      const http = send();

      const response = await registerByInvite(http, token);

      expect(response.status).toBe(201);
      const session = sessionResponseSchema.parse(response.body);
      expect(session).toMatchObject({ role: 'manager', workspace: owner.session.workspace });
      expect([...setCookies(response).keys()].toSorted()).toEqual([
        'clientry_access',
        'clientry_refresh',
      ]);
      const me = await http.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ workspace: { id: owner.session.workspace.id } });
      const invite = await prisma.invite.findUniqueOrThrow({ where: { id } });
      expect(invite.usedAt).not.toBeNull();
      expect(invite.usedById).toBe(session.user.id);
    });

    it('should answer 404 when the same link is used again', async () => {
      const { token } = await createInvite(owner);
      await registerByInvite(send(), token).expect(201);

      const response = await registerByInvite(send(), token);

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('INVITE_INVALID');
    });

    it('should answer 409 EMAIL_TAKEN and keep the link usable when the email is registered', async () => {
      const { token } = await createInvite(owner);

      const response = await registerByInvite(send(), token, stranger.email);

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('EMAIL_TAKEN');
      expect((await preview(token)).status).toBe(200);
    });

    it('should let one of two concurrent joins through when they use the same link', async () => {
      const { id, token } = await createInvite(owner);
      // Holding the invite row makes both joins wait at the claim, so they really overlap.
      const holder = await holdTransaction(
        prisma,
        (tx) => tx.$queryRaw`SELECT id FROM invites WHERE id = ${id}::uuid FOR UPDATE`,
      );
      const joining = Promise.all([
        registerByInvite(send(), token).then((response) => response),
        registerByInvite(send(), token).then((response) => response),
      ]);
      await waitForLockWaiter(prisma, 2);
      await holder.commit();

      const responses = await joining;

      expect(responses.map(({ status }) => status).toSorted()).toEqual([201, 404]);
      expect(
        await prisma.membership.count({ where: { workspaceId: owner.session.workspace.id } }),
      ).toBe(2);
    });

    it('should end the previous session of the browser when it joins with another account', async () => {
      const previous = await registerAccount(testApp, 'Third Studio');
      const { token } = await createInvite(owner);

      await registerByInvite(previous.http, token).expect(201);

      const refresh = await send()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${previous.refreshToken}`);
      expect(refresh.status).toBe(401);
    });
  });

  describe('login by invite', () => {
    it('should bring a removed owner back as a manager when they log in to join', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const managerId = manager.session.user.id;
      await owner.http.patch(`/api/members/${managerId}`).send({ role: 'owner' }).expect(200);
      await owner.http
        .delete(`/api/members/${managerId}`)
        .query({ transferTo: owner.session.user.id })
        .expect(204);
      const { token } = await createInvite(owner);

      const response = await loginByInvite(token, manager.email);

      expect(response.status).toBe(200);
      expect(sessionResponseSchema.parse(response.body)).toMatchObject({
        role: 'manager',
        workspace: owner.session.workspace,
      });
    });

    it('should answer 401 on the refresh token from before the removal when the member joins again', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      await owner.http
        .delete(`/api/members/${manager.session.user.id}`)
        .query({ transferTo: owner.session.user.id })
        .expect(204);
      const { token } = await createInvite(owner);
      await loginByInvite(token, manager.email).expect(200);

      const response = await send()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${manager.refreshToken}`);

      expect(response.status).toBe(401);
    });

    it('should answer 409 ALREADY_IN_WORKSPACE and keep the link usable when the account has a membership', async () => {
      const { token } = await createInvite(owner);

      const response = await loginByInvite(token, stranger.email);

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('ALREADY_IN_WORKSPACE');
      expect((await preview(token)).status).toBe(200);
    });

    it('should answer 409 ALREADY_IN_WORKSPACE and keep the link usable when a concurrent join gives the account a membership first', async () => {
      const workspaceId = owner.session.workspace.id;
      const manager = await addManager(testApp, workspaceId);
      const managerId = manager.session.user.id;
      await owner.http
        .delete(`/api/members/${managerId}`)
        .query({ transferTo: owner.session.user.id })
        .expect(204);
      const { token } = await createInvite(owner);
      // Another join of the account in flight: its membership is inserted, not committed yet.
      const otherJoin = await holdTransaction(prisma, (tx) =>
        tx.membership.create({ data: { userId: managerId, workspaceId, role: 'manager' } }),
      );
      const joining = loginByInvite(token, manager.email).then((response) => response);
      await waitForLockWaiter(prisma);

      await otherJoin.commit();

      const response = await joining;
      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('ALREADY_IN_WORKSPACE');
      expect((await preview(token)).status).toBe(200);
    });

    it('should answer 401 INVALID_CREDENTIALS when the password is wrong', async () => {
      const { token } = await createInvite(owner);

      const response = await loginByInvite(token, stranger.email, 'wrong password');

      expect(response.status).toBe(401);
      expect(codeOf(response)).toBe('INVALID_CREDENTIALS');
    });

    it('should answer 404 INVITE_INVALID, not 401, when the token is unknown and the password wrong', async () => {
      const response = await loginByInvite(UNKNOWN_TOKEN, stranger.email, 'wrong password');

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('INVITE_INVALID');
    });
  });

  describe('stale role', () => {
    it('should answer 403 without an invite when the owner is demoted while the create waits for the lock', async () => {
      const workspaceId = owner.session.workspace.id;
      const demotion = await holdTransaction(prisma, async (tx) => {
        await lockWorkspace(tx, workspaceId);
        await tx.membership.update({
          where: { userId: owner.session.user.id },
          data: { role: 'manager' },
        });
      });

      const creating = owner.http.post('/api/invites').then((response) => response);
      await waitForLockWaiter(prisma);
      await demotion.commit();
      const response = await creating;

      expect(response.status).toBe(403);
      expect(codeOf(response)).toBe('INSUFFICIENT_ROLE');
      expect(await prisma.invite.count()).toBe(0);
    });
  });
});
