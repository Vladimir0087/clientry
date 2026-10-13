import { agent } from 'supertest';
import type { Agent, Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@clientry/shared/auth';
import { apiProblemSchema } from '@clientry/shared/common';
import { memberListResponseSchema, memberSchema } from '@clientry/shared/workspaces';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount, TEST_PASSWORD } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createInvite } from '../../../test/fixtures/invites.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { opaqueTokenHash } from '../../../test/support/auth-tokens.js';
import { holdTransaction, waitForLockWaiter } from '../../../test/support/held-transaction.js';
import { TestOnlyModule } from '../../../test/support/test-only.module.js';
import { generateOpaqueToken } from '../../common/crypto/opaque-token.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';
import { SessionsRepository } from '../auth/sessions.repository.js';

const UNKNOWN_ID = '0199a3c4-0000-7000-8000-000000000000';

function codeOf(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

describe('members API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let stranger: TestAccount;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function setRole(account: TestAccount, memberId: string, role: string): Test {
    return account.http.patch(`/api/members/${memberId}`).send({ role });
  }

  function remove(account: TestAccount, memberId: string, transferTo: string): Test {
    return account.http.delete(`/api/members/${memberId}`).query({ transferTo });
  }

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TestOnlyModule] });
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

  describe('list', () => {
    it('should list the members of the own workspace in join order when a manager asks', async () => {
      const first = await addManager(testApp, owner.session.workspace.id);
      const second = await addManager(testApp, owner.session.workspace.id);
      await addManager(testApp, stranger.session.workspace.id);

      const response = await first.http.get('/api/members');

      expect(response.status).toBe(200);
      const { items } = memberListResponseSchema.parse(response.body);
      expect(items.map(({ id }) => id)).toEqual([
        owner.session.user.id,
        first.session.user.id,
        second.session.user.id,
      ]);
      expect(items[0]).toMatchObject({ name: 'Ann', email: owner.email, role: 'owner' });
      expect(items[1]).toMatchObject({ name: 'Max', role: 'manager' });
    });
  });

  describe('role change', () => {
    it('should let the manager pass an owner-only route with the same access token when promoted', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);

      const response = await setRole(owner, manager.session.user.id, 'owner');

      expect(response.status).toBe(200);
      expect(memberSchema.parse(response.body).role).toBe('owner');
      await manager.http.get('/api/test/protected/owner').expect(200);
    });

    it('should answer 409 LAST_OWNER when the only owner is demoted', async () => {
      const response = await setRole(owner, owner.session.user.id, 'manager');

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('LAST_OWNER');
    });

    it('should leave one owner when two owners demote each other at once', async () => {
      const workspaceId = owner.session.workspace.id;
      const second = await addManager(testApp, workspaceId);
      await setRole(owner, second.session.user.id, 'owner').expect(200);
      // Both requests pass the guard as owners and then queue for the workspace lock.
      const lock = await holdTransaction(prisma, (tx) => lockWorkspace(tx, workspaceId));
      const demotions = Promise.all([
        setRole(owner, second.session.user.id, 'manager'),
        setRole(second, owner.session.user.id, 'manager'),
      ]);
      await waitForLockWaiter(prisma, 2);

      await lock.commit();

      const responses = await demotions;
      expect(responses.map(({ status }) => status).toSorted()).toEqual([200, 403]);
      const refused = responses.find(({ status }) => status === 403);
      expect(refused === undefined ? null : codeOf(refused)).toBe('INSUFFICIENT_ROLE');
      const owners = await prisma.membership.count({
        where: { workspaceId: owner.session.workspace.id, role: 'owner' },
      });
      expect(owners).toBe(1);
    });

    it('should stop the pending invites of an owner when they are demoted', async () => {
      const second = await addManager(testApp, owner.session.workspace.id);
      await setRole(owner, second.session.user.id, 'owner').expect(200);
      const theirs = await createInvite(second);
      const kept = await createInvite(owner);

      await setRole(owner, second.session.user.id, 'manager').expect(200);

      const previews = await Promise.all(
        [theirs.token, kept.token].map((token) =>
          send().post('/api/auth/invite/preview').send({ token }),
        ),
      );
      expect(previews.map(({ status }) => status)).toEqual([404, 200]);
    });

    it('should answer 200 without a write when the member already has the role', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const before = await prisma.membership.findUniqueOrThrow({
        where: { userId: manager.session.user.id },
      });

      const response = await setRole(owner, manager.session.user.id, 'manager');

      expect(response.status).toBe(200);
      const after = await prisma.membership.findUniqueOrThrow({
        where: { userId: manager.session.user.id },
      });
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('should answer 404 MEMBER_NOT_FOUND when the user is another workspace’s member', async () => {
      const response = await setRole(owner, stranger.session.user.id, 'manager');

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('MEMBER_NOT_FOUND');
      expect(
        await prisma.membership.findUniqueOrThrow({ where: { userId: stranger.session.user.id } }),
      ).toMatchObject({ role: 'owner' });
    });
  });

  describe('removal', () => {
    it('should answer 401 on the old access and refresh tokens when the member is removed', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);

      await remove(owner, manager.session.user.id, owner.session.user.id).expect(204);

      await send()
        .get('/api/auth/me')
        .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${manager.accessToken}`)
        .expect(401);
      await send()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${manager.refreshToken}`)
        .expect(401);
    });

    it('should revoke every session of the member when they are removed', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      await send()
        .post('/api/auth/login')
        .send({ email: manager.email, password: TEST_PASSWORD })
        .expect(200);

      await remove(owner, manager.session.user.id, owner.session.user.id).expect(204);

      const sessions = await prisma.session.findMany({
        where: { userId: manager.session.user.id },
        select: { revokedAt: true },
      });
      expect(sessions).toHaveLength(2);
      expect(sessions.filter(({ revokedAt }) => revokedAt === null)).toHaveLength(0);
    });

    it('should answer 403 NO_WORKSPACE and start no session when a login waits for a removal that commits', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const userId = manager.session.user.id;
      const before = await prisma.session.count({ where: { userId } });
      // A removal in flight: the membership is deleted, not committed yet.
      const removal = await holdTransaction(prisma, (tx) =>
        tx.membership.deleteMany({ where: { userId } }),
      );
      const login = send()
        .post('/api/auth/login')
        .send({ email: manager.email, password: TEST_PASSWORD })
        .then((response) => response);
      await waitForLockWaiter(prisma);

      await removal.commit();

      const response = await login;
      expect(response.status).toBe(403);
      expect(codeOf(response)).toBe('NO_WORKSPACE');
      expect(await prisma.session.count({ where: { userId } })).toBe(before);
    });

    it('should start no session for the member when they are removed before it starts', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const userId = manager.session.user.id;
      await remove(owner, userId, owner.session.user.id).expect(204);
      const before = await prisma.session.count({ where: { userId } });

      const sessionId = await testApp.app.get(SessionsRepository).createSession({
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: opaqueTokenHash(generateOpaqueToken()),
      });

      expect(sessionId).toBeNull();
      expect(await prisma.session.count({ where: { userId } })).toBe(before);
    });

    it('should answer 403 NO_WORKSPACE on login when the member is removed', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);

      await remove(owner, manager.session.user.id, owner.session.user.id).expect(204);

      const login = await send()
        .post('/api/auth/login')
        .send({ email: manager.email, password: TEST_PASSWORD });
      expect(login.status).toBe(403);
      expect(codeOf(login)).toBe('NO_WORKSPACE');
    });

    it('should keep the clients of the member with their name when they are removed', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      await createClient(manager.http, { name: 'Romashka LLC' });

      await remove(owner, manager.session.user.id, owner.session.user.id).expect(204);

      const clients = await owner.http.get('/api/clients').expect(200);
      expect(clients.body).toMatchObject({
        items: [{ name: 'Romashka LLC', createdBy: { name: 'Max' } }],
      });
    });

    // An owner, so their invites are still pending when the removal starts.
    it('should stop the pending invites the member created when they are removed', async () => {
      const second = await addManager(testApp, owner.session.workspace.id);
      await setRole(owner, second.session.user.id, 'owner').expect(200);
      const theirs = await createInvite(second);
      const kept = await createInvite(owner);

      await remove(owner, second.session.user.id, owner.session.user.id).expect(204);

      const previews = await Promise.all(
        [theirs.token, kept.token].map((token) =>
          send().post('/api/auth/invite/preview').send({ token }),
        ),
      );
      expect(previews.map(({ status }) => status)).toEqual([404, 200]);
    });

    it('should answer 409 LAST_OWNER when the only owner is removed', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);

      const response = await remove(owner, owner.session.user.id, manager.session.user.id);

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('LAST_OWNER');
    });

    it('should answer 404 and change nothing when the member is in another workspace', async () => {
      const response = await remove(owner, stranger.session.user.id, owner.session.user.id);

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('MEMBER_NOT_FOUND');
      await stranger.http.get('/api/auth/me').expect(200);
    });

    it('should answer 400 on id when the member id is not a UUID', async () => {
      const response = await remove(owner, 'not-a-uuid', owner.session.user.id);

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['id']);
    });
  });

  describe('workspace rename', () => {
    it('should rename the workspace and show the name in /me when an owner renames it', async () => {
      const response = await owner.http.patch('/api/workspace').send({ name: '  Pixel Lab ' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: owner.session.workspace.id, name: 'Pixel Lab' });
      const me = await owner.http.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ workspace: { name: 'Pixel Lab' } });
    });

    it('should answer 400 on name when the name is blank', async () => {
      const response = await owner.http.patch('/api/workspace').send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['name']);
    });
  });

  describe('permission matrix', () => {
    interface RestrictedRoute {
      readonly name: string;
      readonly call: (http: Agent) => Test;
      // What the owner gets past the guard with the arguments below.
      readonly ownerStatus: number;
    }

    function routes(memberId: string, stageId: string): readonly RestrictedRoute[] {
      return [
        { name: 'GET /api/invites', call: (http) => http.get('/api/invites'), ownerStatus: 200 },
        { name: 'POST /api/invites', call: (http) => http.post('/api/invites'), ownerStatus: 201 },
        {
          name: 'DELETE /api/invites/:id',
          call: (http) => http.delete(`/api/invites/${UNKNOWN_ID}`),
          ownerStatus: 404,
        },
        {
          name: 'PATCH /api/members/:id',
          call: (http) => http.patch(`/api/members/${memberId}`).send({ role: 'owner' }),
          ownerStatus: 200,
        },
        {
          name: 'DELETE /api/members/:id',
          call: (http) =>
            http.delete(`/api/members/${memberId}`).query({ transferTo: owner.session.user.id }),
          ownerStatus: 204,
        },
        {
          name: 'PATCH /api/workspace',
          call: (http) => http.patch('/api/workspace').send({ name: 'Taken over' }),
          ownerStatus: 200,
        },
        {
          name: 'POST /api/stages',
          call: (http) => http.post('/api/stages').send({ name: 'Review' }),
          ownerStatus: 201,
        },
        {
          name: 'PATCH /api/stages/:id',
          call: (http) => http.patch(`/api/stages/${stageId}`).send({ name: 'Renamed' }),
          ownerStatus: 200,
        },
        {
          name: 'PUT /api/stages/order',
          call: (http) => http.put('/api/stages/order').send({ ids: [stageId] }),
          ownerStatus: 409,
        },
        {
          name: 'DELETE /api/stages/:id',
          call: (http) => http.delete(`/api/stages/${stageId}`).query({ moveDealsTo: stageId }),
          ownerStatus: 400,
        },
      ];
    }

    async function snapshot(): Promise<unknown> {
      const workspaceId = owner.session.workspace.id;
      return {
        invites: await prisma.invite.count(),
        members: await prisma.membership.findMany({
          where: { workspaceId },
          select: { userId: true, role: true },
          orderBy: { userId: 'asc' },
        }),
        workspace: await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
        stages: await prisma.stage.findMany({ where: { workspaceId }, orderBy: { id: 'asc' } }),
      };
    }

    it('should answer 403 INSUFFICIENT_ROLE and write nothing on every restricted route when a manager calls', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const stage = await prisma.stage.findFirstOrThrow({
        where: { workspaceId: owner.session.workspace.id },
      });
      const before = await snapshot();

      for (const route of routes(manager.session.user.id, stage.id)) {
        const response = await route.call(manager.http);

        expect({ route: route.name, status: response.status, code: codeOf(response) }).toEqual({
          route: route.name,
          status: 403,
          code: 'INSUFFICIENT_ROLE',
        });
      }
      expect(await snapshot()).toEqual(before);
    });

    it('should pass every restricted route to its handler when an owner calls', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const stage = await prisma.stage.findFirstOrThrow({
        where: { workspaceId: owner.session.workspace.id },
      });

      for (const route of routes(manager.session.user.id, stage.id)) {
        const response = await route.call(owner.http);

        expect({ route: route.name, status: response.status }).toEqual({
          route: route.name,
          status: route.ownerStatus,
        });
      }
    });
  });
});
