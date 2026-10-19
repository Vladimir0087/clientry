import type { Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { findStageIds } from '../../../test/fixtures/deals.js';
import { enterDemo, resetDemo } from '../../../test/fixtures/demo.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { TRUSTED_ORIGIN } from '../../../test/support/test-env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { DEMO_WORKSPACE, PEOPLE } from '../demo/data/people.js';

const UNKNOWN_ID = '0199a3c4-0000-7000-8000-000000000000';

type Call = (account: TestAccount) => Test;

function codeOf(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

const TEAM_CALLS: readonly (readonly [string, Call])[] = [
  ['creating an invite', ({ http }) => http.post('/api/invites').set('Origin', TRUSTED_ORIGIN)],
  ['listing invites', ({ http }) => http.get('/api/invites')],
  [
    'revoking an invite',
    ({ http }) => http.delete(`/api/invites/${UNKNOWN_ID}`).set('Origin', TRUSTED_ORIGIN),
  ],
  [
    'changing a role',
    ({ http }) =>
      http
        .patch(`/api/members/${PEOPLE.sofia.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ role: 'owner' }),
  ],
  [
    'removing a member',
    ({ http }) =>
      http
        .delete(`/api/members/${PEOPLE.sofia.id}`)
        .query({ transferTo: PEOPLE.max.id })
        .set('Origin', TRUSTED_ORIGIN),
  ],
  [
    'renaming the workspace',
    ({ http }) =>
      http.patch('/api/workspace').set('Origin', TRUSTED_ORIGIN).send({ name: 'Taken over' }),
  ],
];

describe('demo lock', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  async function teamState(): Promise<unknown> {
    return {
      invites: await prisma.invite.count(),
      memberships: await prisma.membership.findMany({
        where: { workspaceId: DEMO_WORKSPACE.id },
        orderBy: { userId: 'asc' },
        select: { userId: true, role: true },
      }),
      workspace: await prisma.workspace.findUnique({
        where: { id: DEMO_WORKSPACE.id },
        select: { name: true },
      }),
    };
  }

  async function clientCreatedBy(userId: string): Promise<string> {
    const { id } = await prisma.client.findFirstOrThrow({
      where: { workspaceId: DEMO_WORKSPACE.id, createdById: userId },
      select: { id: true },
    });
    return id;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await resetDemo(testApp);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('as the demo owner', () => {
    let owner: TestAccount;

    beforeEach(async () => {
      owner = await enterDemo(testApp, 'owner');
    });

    it.each(TEAM_CALLS)(
      'should answer 403 DEMO_LOCKED and write nothing when %s',
      async (_action, call) => {
        const before = await teamState();

        const response = await call(owner);

        expect(response.status).toBe(403);
        expect(codeOf(response)).toBe('DEMO_LOCKED');
        expect(await teamState()).toEqual(before);
      },
    );

    it('should create and delete a stage when the owner manages stages', async () => {
      const stages = await findStageIds(testApp, DEMO_WORKSPACE.id);
      const created = await owner.http
        .post('/api/stages')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ name: 'Review' })
        .expect(201);
      const { id } = created.body as { id: string };

      await owner.http
        .delete(`/api/stages/${id}`)
        .query({ moveDealsTo: stages.New })
        .set('Origin', TRUSTED_ORIGIN)
        .expect(204);
    });

    it("should delete another member's client when the owner deletes it", async () => {
      const clientId = await clientCreatedBy(PEOPLE.sofia.id);

      const response = await owner.http
        .delete(`/api/clients/${clientId}`)
        .set('Origin', TRUSTED_ORIGIN);

      expect(response.status).toBe(204);
    });
  });

  describe('as the demo manager', () => {
    let manager: TestAccount;

    beforeEach(async () => {
      manager = await enterDemo(testApp, 'manager');
    });

    it.each(TEAM_CALLS)('should answer 403 INSUFFICIENT_ROLE when %s', async (_action, call) => {
      const response = await call(manager);

      expect(response.status).toBe(403);
      expect(codeOf(response)).toBe('INSUFFICIENT_ROLE');
    });

    it('should answer 403 INSUFFICIENT_ROLE when the manager adds a stage', async () => {
      const response = await manager.http
        .post('/api/stages')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ name: 'Review' });

      expect(response.status).toBe(403);
      expect(codeOf(response)).toBe('INSUFFICIENT_ROLE');
    });

    it('should delete his own client and refuse Ann’s when the manager deletes clients', async () => {
      const own = await clientCreatedBy(PEOPLE.max.id);
      const anns = await clientCreatedBy(PEOPLE.ann.id);

      const ownResponse = await manager.http
        .delete(`/api/clients/${own}`)
        .set('Origin', TRUSTED_ORIGIN);
      const annsResponse = await manager.http
        .delete(`/api/clients/${anns}`)
        .set('Origin', TRUSTED_ORIGIN);

      expect(ownResponse.status).toBe(204);
      expect(annsResponse.status).toBe(403);
      expect(codeOf(annsResponse)).toBe('CLIENT_DELETE_FORBIDDEN');
    });
  });

  it('should let a registered owner create an invite and rename the workspace as before', async () => {
    const registered = await registerAccount(testApp);

    await registered.http.post('/api/invites').set('Origin', TRUSTED_ORIGIN).expect(201);
    await registered.http
      .patch('/api/workspace')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Renamed Studio' })
      .expect(200);
  });
});
