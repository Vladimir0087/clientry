import { agent } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEvent, ActivityFeedResponse } from '@clientry/shared/activity';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertActivityEntries, parseFeed } from '../../../test/fixtures/activity.js';
import type { ActivitySeed, ActivitySubjectColumn } from '../../../test/fixtures/activity.js';
import { insertClients } from '../../../test/fixtures/clients.js';
import { findStageIds, insertDeals } from '../../../test/fixtures/deals.js';
import type { StageIds } from '../../../test/fixtures/deals.js';
import { insertTasks } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { recordStatements } from '../../../test/support/statements.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { positionsAfter } from '../deals/deal-position.js';

const STAGE = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c', name: 'New', kind: 'open' } as const;
const PAID = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8d', name: 'Paid', kind: 'won' } as const;

function minute(index: number): Date {
  return new Date(Date.UTC(2026, 9, 13, 9, index));
}

describe('activity feed API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;
  let workspaceId: string;
  let ownerId: string;
  let stages: StageIds;
  let clientId: string;
  let dealId: string;
  let taskId: string;

  async function feed(query = '', account = owner): Promise<ActivityFeedResponse> {
    return parseFeed(await account.http.get(`/api/activity${query}`));
  }

  function seed(subject: ActivitySubjectColumn, event: ActivityEvent, at: number): ActivitySeed {
    return { actorId: ownerId, subject, event, createdAt: minute(at) };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
    workspaceId = owner.session.workspace.id;
    ownerId = owner.session.user.id;
    manager = await addManager(testApp, workspaceId);
    stages = await findStageIds(testApp, workspaceId);
    [clientId = ''] = await insertClients(testApp, workspaceId, [
      { name: 'Romashka LLC', createdById: ownerId },
    ]);
    [dealId = ''] = await insertDeals(testApp, workspaceId, [
      {
        clientId,
        stageId: stages.New,
        createdById: ownerId,
        position: positionsAfter(null, 1)[0] ?? '',
        title: 'Landing page',
      },
    ]);
    [taskId = ''] = await insertTasks(testApp, workspaceId, [
      { createdById: ownerId, dueAt: minute(30), title: 'Call back', dealId },
    ]);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should list entries of every type newest first with actor and subject when they exist', async () => {
    const assignee = { id: manager.session.user.id, name: 'Max' };
    await insertActivityEntries(testApp, workspaceId, [
      seed({ clientId }, { type: 'client_created', payload: {} }, 0),
      seed(
        { dealId },
        { type: 'deal_created', payload: { stage: STAGE, amount: 100_00, currency: 'USD' } },
        1,
      ),
      seed(
        { dealId },
        { type: 'deal_updated', payload: { changes: [{ field: 'title', from: 'A', to: 'B' }] } },
        2,
      ),
      seed({ dealId }, { type: 'deal_moved', payload: { from: STAGE, to: PAID } }, 3),
      seed({ dealId }, { type: 'deal_deleted', payload: {} }, 4),
      seed({ dealId }, { type: 'deal_restored', payload: {} }, 5),
      seed(
        { taskId },
        { type: 'task_created', payload: { assignee, dueAt: minute(30).toISOString() } },
        6,
      ),
      seed({ taskId }, { type: 'task_completed', payload: {} }, 7),
    ]);

    const { items, nextCursor } = await feed();

    expect(items.map(({ type }) => type)).toEqual([
      'task_completed',
      'task_created',
      'deal_restored',
      'deal_deleted',
      'deal_moved',
      'deal_updated',
      'deal_created',
      'client_created',
    ]);
    expect(items[1]).toMatchObject({
      actor: { id: ownerId, name: 'Ann' },
      subject: { kind: 'task', id: taskId, label: 'Call back', isAvailable: true },
      payload: { assignee },
      createdAt: minute(6).toISOString(),
    });
    expect(items.at(-1)?.subject).toEqual({
      kind: 'client',
      id: clientId,
      label: 'Romashka LLC',
      isAvailable: true,
    });
    expect(nextCursor).toBeNull();
  });

  it('should label a deal by its current title when it was renamed after the entry', async () => {
    await insertActivityEntries(testApp, workspaceId, [
      seed({ dealId }, { type: 'deal_deleted', payload: {} }, 0),
    ]);
    await prisma.deal.update({ where: { id: dealId }, data: { title: 'Renamed page' } });

    const { items } = await feed();

    expect(items[0]?.subject.label).toBe('Renamed page');
  });

  describe('availability', () => {
    let otherDealId: string;
    let otherClientId: string;

    beforeEach(async () => {
      [otherClientId = ''] = await insertClients(testApp, workspaceId, [
        { name: 'Lutik', createdById: ownerId },
      ]);
      [otherDealId = ''] = await insertDeals(testApp, workspaceId, [
        {
          clientId: otherClientId,
          stageId: stages.New,
          createdById: ownerId,
          position: positionsAfter(null, 1)[0] ?? '',
        },
      ]);
      await insertActivityEntries(testApp, workspaceId, [
        seed({ dealId }, { type: 'deal_deleted', payload: {} }, 0),
        seed({ dealId: otherDealId }, { type: 'deal_deleted', payload: {} }, 1),
        seed({ clientId: otherClientId }, { type: 'client_created', payload: {} }, 2),
        seed({ taskId }, { type: 'task_completed', payload: {} }, 3),
      ]);
    });

    async function availability(): Promise<boolean[]> {
      return (await feed()).items.map(({ subject }) => subject.isAvailable).toReversed();
    }

    it('should mark a deleted deal and a task of that deal unavailable when the deal is deleted', async () => {
      await prisma.deal.update({ where: { id: dealId }, data: { deletedAt: new Date() } });

      expect(await availability()).toEqual([false, true, true, false]);
    });

    it('should mark a deal of a deleted client and the client unavailable when the client is deleted', async () => {
      await prisma.client.update({ where: { id: otherClientId }, data: { deletedAt: new Date() } });

      expect(await availability()).toEqual([true, false, false, true]);
    });

    it('should mark the subjects available again when they are restored', async () => {
      await prisma.deal.update({ where: { id: dealId }, data: { deletedAt: new Date() } });
      await prisma.client.update({ where: { id: otherClientId }, data: { deletedAt: new Date() } });
      await prisma.deal.update({ where: { id: dealId }, data: { deletedAt: null } });
      await prisma.client.update({ where: { id: otherClientId }, data: { deletedAt: null } });

      expect(await availability()).toEqual([true, true, true, true]);
    });
  });

  it('should return 45 entries over three pages each once when the feed is paged', async () => {
    await insertActivityEntries(
      testApp,
      workspaceId,
      Array.from({ length: 45 }, (_, index) =>
        seed({ clientId }, { type: 'client_created', payload: {} }, index % 5),
      ),
    );

    const first = await feed();
    const second = await feed(`?cursor=${first.nextCursor ?? ''}`);
    const third = await feed(`?cursor=${second.nextCursor ?? ''}`);

    const ids = [...first.items, ...second.items, ...third.items].map(({ id }) => id);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([20, 20, 5]);
    expect(new Set(ids).size).toBe(45);
    expect(third.nextCursor).toBeNull();
  });

  it('should read a page with one statement whatever its size when subjects of every kind are listed', async () => {
    await insertActivityEntries(
      testApp,
      workspaceId,
      Array.from({ length: 30 }, (_, index) => {
        const subjects: ActivitySubjectColumn[] = [{ dealId }, { clientId }, { taskId }];
        const subject = subjects[index % 3] ?? { clientId };
        const event: ActivityEvent =
          'dealId' in subject
            ? { type: 'deal_deleted', payload: {} }
            : 'clientId' in subject
              ? { type: 'client_created', payload: {} }
              : { type: 'task_completed', payload: {} };
        return seed(subject, event, index);
      }),
    );
    const statements = recordStatements(prisma);

    await feed('?limit=50');

    expect(statements.filter((query) => query.includes('FROM activities'))).toHaveLength(1);
  });

  it("should leave out another workspace's entries when that workspace has activity", async () => {
    const strangerWorkspace = stranger.session.workspace.id;
    const strangerId = stranger.session.user.id;
    const [strangerClient = ''] = await insertClients(testApp, strangerWorkspace, [
      { name: 'Their client', createdById: strangerId },
    ]);
    await insertActivityEntries(testApp, strangerWorkspace, [
      {
        actorId: strangerId,
        subject: { clientId: strangerClient },
        event: { type: 'client_created', payload: {} },
        createdAt: minute(0),
      },
    ]);

    expect((await feed()).items).toEqual([]);
    expect((await feed('', stranger)).items).toHaveLength(1);
  });

  it('should answer 400 on cursor when the cursor is broken', async () => {
    const response = await owner.http.get('/api/activity?cursor=abc$');

    expect(response.status).toBe(400);
    expect(apiProblemSchema.parse(response.body).errors).toEqual([
      { path: 'cursor', message: 'Invalid cursor' },
    ]);
  });

  it('should answer 401 when the feed is requested without the access cookie', async () => {
    const response = await agent(testApp.app.getHttpServer()).get('/api/activity');

    expect(response.status).toBe(401);
    expect(apiProblemSchema.parse(response.body).code).toBe('AUTHENTICATION_REQUIRED');
  });
});
