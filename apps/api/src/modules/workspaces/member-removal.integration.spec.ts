import type { Response, Test } from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  onTestFinished,
} from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds, insertDeals } from '../../../test/fixtures/deals.js';
import type { StageIds } from '../../../test/fixtures/deals.js';
import { countNotifications } from '../../../test/fixtures/notifications.js';
import { createTask, insertTasks } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import {
  holdSteppedTransaction,
  holdTransaction,
  waitForBlockedBy,
  waitForLockWaiter,
} from '../../../test/support/held-transaction.js';
import { flushValkey } from '../../../test/support/valkey.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { positionsAfter } from '../deals/deal-position.js';

const DUE_AT = new Date('2030-03-15T12:00:00.000Z');
const UNKNOWN_ID = '0199a3c4-0000-7000-8000-000000000000';
const INVALID_RECEIVERS = [
  'missing',
  'the removed member',
  'not a member',
  'another workspace user',
] as const;
// Long enough for the removal to commit first on a slow CI runner.
const REMINDER_DELAY_MS = 4000;

function fromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

function readMembershipForShare(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<unknown[]> {
  return tx.$queryRaw<unknown[]>`
    SELECT 1 FROM memberships
    WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
    FOR SHARE`;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

// Every run of the removal's transaction starts with the workspace lock.
function countWorkspaceLocks(prisma: PrismaService): () => number {
  let count = 0;
  // Prisma has no way to remove a listener, so it stops counting when the test ends.
  let isCounting = true;
  onTestFinished(() => {
    isCounting = false;
  });
  prisma.$on('query', (event) => {
    if (isCounting && /FROM workspaces\b.*FOR NO KEY UPDATE/s.test(event.query)) {
      count += 1;
    }
  });
  return () => count;
}

function lockTaskForUpdate(tx: Prisma.TransactionClient, taskId: string): Promise<unknown[]> {
  return tx.$queryRaw<unknown[]>`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
}

describe('member removal', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let clientId: string;
  let stages: StageIds;

  function remove(memberId: string, transferTo = owner.session.user.id): Test {
    return owner.http.delete(`/api/members/${memberId}`).query({ transferTo });
  }

  async function invalidTransferTo(
    target: (typeof INVALID_RECEIVERS)[number],
  ): Promise<string | undefined> {
    switch (target) {
      case 'missing':
        return undefined;
      case 'the removed member':
        return manager.session.user.id;
      case 'not a member':
        return UNKNOWN_ID;
      case 'another workspace user':
        return (await registerAccount(testApp, 'Other Studio')).session.user.id;
    }
  }

  function dealBody(assigneeId: string): Parameters<typeof createDeal>[1] {
    return {
      title: 'Landing page',
      clientId,
      stageId: stages.New,
      amount: 150_000,
      currency: 'USD',
      assigneeId,
    };
  }

  async function prepare(): Promise<void> {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    manager = await addManager(testApp, owner.session.workspace.id);
    stages = await findStageIds(testApp, owner.session.workspace.id);
    clientId = (await createClient(owner.http, { name: 'Romashka LLC' })).id;
  }

  async function seedWork(assigneeId: string, count: number): Promise<void> {
    const workspaceId = owner.session.workspace.id;
    const createdById = owner.session.user.id;
    await insertDeals(
      testApp,
      workspaceId,
      positionsAfter(null, count).map((position) => ({
        clientId,
        stageId: stages.New,
        createdById,
        assigneeId,
        position,
      })),
    );
    await insertTasks(
      testApp,
      workspaceId,
      Array.from({ length: count }, () => ({ createdById, assigneeId, dueAt: DUE_AT })),
    );
  }

  describe('handover', () => {
    beforeAll(async () => {
      testApp = await createTestApp();
      prisma = testApp.app.get(PrismaService);
    });

    beforeEach(prepare);

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should hand open deals and tasks over to transferTo, deleted ones included, and keep closed ones when the member is removed', async () => {
      const workspaceId = owner.session.workspace.id;
      const managerId = manager.session.user.id;
      const createdById = owner.session.user.id;
      const receiverId = (await addManager(testApp, workspaceId)).session.user.id;
      const [first = '', second = '', third = ''] = positionsAfter(null, 3);
      const [openDeal, deletedDeal, wonDeal] = await insertDeals(testApp, workspaceId, [
        { clientId, stageId: stages.New, createdById, assigneeId: managerId, position: first },
        {
          clientId,
          stageId: stages.Call,
          createdById,
          assigneeId: managerId,
          position: second,
          deletedAt: new Date(),
        },
        {
          clientId,
          stageId: stages.Paid,
          createdById,
          assigneeId: managerId,
          position: third,
          closedAt: new Date(),
        },
      ]);
      const [openTask, deletedTask, doneTask] = await insertTasks(testApp, workspaceId, [
        { createdById, assigneeId: managerId, dueAt: DUE_AT },
        { createdById, assigneeId: managerId, dueAt: DUE_AT, deletedAt: new Date() },
        { createdById, assigneeId: managerId, dueAt: DUE_AT, doneAt: new Date() },
      ]);

      await remove(managerId, receiverId).expect(204);

      const deals = await prisma.deal.findMany({
        select: { id: true, assigneeId: true, version: true },
      });
      const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
      expect(dealsById.get(openDeal ?? '')).toMatchObject({ assigneeId: receiverId, version: 2 });
      expect(dealsById.get(deletedDeal ?? '')).toMatchObject({
        assigneeId: receiverId,
        version: 2,
      });
      expect(dealsById.get(wonDeal ?? '')).toMatchObject({ assigneeId: managerId, version: 1 });
      const tasks = await prisma.task.findMany({ select: { id: true, assigneeId: true } });
      const assignees = new Map(tasks.map((task) => [task.id, task.assigneeId]));
      expect([openTask, deletedTask, doneTask].map((id) => assignees.get(id ?? ''))).toEqual([
        receiverId,
        receiverId,
        managerId,
      ]);
    });

    it('should move updated_at of each handed deal and task forward when work is handed over', async () => {
      await seedWork(manager.session.user.id, 1);
      // Far back, so the database clock of the handover cannot tie with it.
      const past = new Date('2026-01-01T00:00:00.000Z');
      await prisma.deal.updateMany({ data: { updatedAt: past } });
      await prisma.task.updateMany({ data: { updatedAt: past } });

      await remove(manager.session.user.id).expect(204);

      const deal = await prisma.deal.findFirstOrThrow({ select: { updatedAt: true } });
      const task = await prisma.task.findFirstOrThrow({ select: { updatedAt: true } });
      expect(deal.updatedAt.getTime()).toBeGreaterThan(past.getTime());
      expect(task.updatedAt.getTime()).toBeGreaterThan(past.getTime());
    });

    it('should answer 400 on assigneeId and keep the deal closed when a won deal of a removed member is moved to an open stage', async () => {
      const deal = await createDeal(owner.http, {
        ...dealBody(manager.session.user.id),
        stageId: stages.Paid,
      });
      await remove(manager.session.user.id).expect(204);

      const response = await owner.http
        .post(`/api/deals/${deal.id}/move`)
        .send({ version: deal.version, stageId: stages.Call, afterId: null });

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['assigneeId']);
      const stored = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
      expect(stored).toMatchObject({ stageId: stages.Paid, version: deal.version });
    });

    it('should answer 400 on assigneeId and keep the task done when a done task of a removed member is reopened', async () => {
      const [taskId = ''] = await insertTasks(testApp, owner.session.workspace.id, [
        {
          createdById: owner.session.user.id,
          assigneeId: manager.session.user.id,
          dueAt: DUE_AT,
          doneAt: new Date(),
        },
      ]);
      await remove(manager.session.user.id).expect(204);

      const response = await owner.http.post(`/api/tasks/${taskId}/reopen`);

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['assigneeId']);
      const stored = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      expect(stored.doneAt).not.toBeNull();
    });

    it('should write one assignee change to transferTo by the remover for each deal when deals are handed over', async () => {
      const receiver = await addManager(testApp, owner.session.workspace.id);
      // Another name than the member's, so swapped name snapshots would show.
      await prisma.user.update({ where: { id: receiver.session.user.id }, data: { name: 'Kim' } });
      const deal = await createDeal(owner.http, dealBody(manager.session.user.id));

      await remove(manager.session.user.id, receiver.session.user.id).expect(204);

      const entries = await prisma.activity.findMany({
        where: { dealId: deal.id, type: 'deal_updated' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorId: owner.session.user.id,
        payload: {
          changes: [
            {
              field: 'assignee',
              from: { id: manager.session.user.id, name: 'Max' },
              to: { id: receiver.session.user.id, name: 'Kim' },
            },
          ],
        },
      });
    });

    it('should answer 409 DEAL_CHANGED when an edit carries the version read before the handover', async () => {
      const deal = await createDeal(owner.http, dealBody(manager.session.user.id));
      await remove(manager.session.user.id).expect(204);

      const response = await owner.http
        .patch(`/api/deals/${deal.id}`)
        .send({ version: deal.version, title: 'Stale edit' });

      expect(response.status).toBe(409);
      expect(apiProblemSchema.parse(response.body).code).toBe('DEAL_CHANGED');
    });

    it.each(INVALID_RECEIVERS)(
      'should answer 400 on transferTo and change nothing when transferTo is %s',
      async (target) => {
        const managerId = manager.session.user.id;
        await seedWork(managerId, 1);
        const transferTo = await invalidTransferTo(target);

        const response = await owner.http
          .delete(`/api/members/${managerId}`)
          .query(transferTo === undefined ? {} : { transferTo });

        expect(response.status).toBe(400);
        expect(errorPaths(response)).toEqual(['transferTo']);
        expect(await prisma.membership.count({ where: { userId: managerId } })).toBe(1);
        expect(await prisma.deal.findMany({ select: { assigneeId: true, version: true } })).toEqual(
          [{ assigneeId: managerId, version: 1 }],
        );
        expect(await prisma.task.findMany({ select: { assigneeId: true } })).toEqual([
          { assigneeId: managerId },
        ]);
        expect(
          await prisma.session.count({ where: { userId: managerId, revokedAt: { not: null } } }),
        ).toBe(0);
      },
    );

    it('should answer 204 when the member has no open work', async () => {
      await remove(manager.session.user.id).expect(204);
    });

    it('should issue as many SQL statements for five records as for one when work is handed over', async () => {
      const other = await addManager(testApp, owner.session.workspace.id);
      await seedWork(manager.session.user.id, 1);
      await seedWork(other.session.user.id, 5);
      const statements: string[] = [];
      // Prisma has no way to remove a listener, so it stops recording when the test ends.
      let isRecording = true;
      onTestFinished(() => {
        isRecording = false;
      });
      prisma.$on('query', (event) => {
        if (isRecording) {
          statements.push(event.query);
        }
      });

      await remove(manager.session.user.id).expect(204);
      const forOne = statements.splice(0).length;
      await remove(other.session.user.id).expect(204);
      const forFive = statements.splice(0).length;

      expect(forFive).toBe(forOne);
      expect(await prisma.deal.count({ where: { assigneeId: owner.session.user.id } })).toBe(6);
    });
  });

  describe('concurrent writes', () => {
    beforeAll(async () => {
      testApp = await createTestApp();
      prisma = testApp.app.get(PrismaService);
    });

    beforeEach(prepare);

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should hand the deal over when it is created for the member while the removal waits for the membership', async () => {
      const managerId = manager.session.user.id;
      const workspaceId = owner.session.workspace.id;
      // A write in flight that read the membership FOR SHARE, as deal and task writes do.
      const writer = await holdTransaction(prisma, (tx) =>
        readMembershipForShare(tx, workspaceId, managerId),
      );
      const removing = remove(managerId).then((response) => response);
      await waitForLockWaiter(prisma);

      const deal = await createDeal(owner.http, dealBody(managerId));
      await writer.commit();

      expect((await removing).status).toBe(204);
      const stored = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
      expect(stored.assigneeId).toBe(owner.session.user.id);
    });

    it('should answer 400 on assigneeId when a deal is created for the member after the removal', async () => {
      await remove(manager.session.user.id).expect(204);

      const response = await owner.http.post('/api/deals').send(dealBody(manager.session.user.id));

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['assigneeId']);
    });

    it('should wait and then hand the task over in one run when a transaction holds the open task', async () => {
      const managerId = manager.session.user.id;
      const workspaceId = owner.session.workspace.id;
      const [taskId = ''] = await insertTasks(testApp, workspaceId, [
        { createdById: managerId, assigneeId: managerId, dueAt: DUE_AT },
      ]);
      const removalRuns = countWorkspaceLocks(prisma);
      // Delivery and task edits lock the task first and read the membership after it.
      const holder = await holdSteppedTransaction(
        prisma,
        (tx) => lockTaskForUpdate(tx, taskId),
        (tx) => readMembershipForShare(tx, workspaceId, managerId),
      );

      const removing = remove(managerId).then((response) => response);
      await waitForLockWaiter(prisma);
      holder.proceed();

      await expect(holder.result).resolves.toHaveLength(1);
      expect((await removing).status).toBe(204);
      expect(removalRuns()).toBe(1);
      const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      expect(task.assigneeId).toBe(owner.session.user.id);
    });

    it('should finish in one run when a task write holds the membership and then reads the member’s deal', async () => {
      const managerId = manager.session.user.id;
      const workspaceId = owner.session.workspace.id;
      const deal = await createDeal(owner.http, dealBody(managerId));
      const removalRuns = countWorkspaceLocks(prisma);
      // A task create on the member's deal reads the membership, then the deal, both FOR SHARE.
      const writer = await holdSteppedTransaction(
        prisma,
        (tx) => readMembershipForShare(tx, workspaceId, managerId),
        (tx) => tx.$queryRaw<unknown[]>`SELECT id FROM deals WHERE id = ${deal.id}::uuid FOR SHARE`,
      );

      const removing = remove(managerId).then((response) => response);
      await waitForLockWaiter(prisma);
      writer.proceed();

      await expect(writer.result).resolves.toHaveLength(1);
      expect((await removing).status).toBe(204);
      expect(removalRuns()).toBe(1);
      const stored = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
      expect(stored.assigneeId).toBe(owner.session.user.id);
    });

    it('should run the removal once more and hand the task over when it loses a deadlock to a reminder delivery', async () => {
      const managerId = manager.session.user.id;
      const ownerId = owner.session.user.id;
      const workspaceId = owner.session.workspace.id;
      const [openTask = '', laterTask = ''] = await insertTasks(testApp, workspaceId, [
        { createdById: managerId, assigneeId: managerId, dueAt: DUE_AT },
        { createdById: ownerId, assigneeId: ownerId, dueAt: DUE_AT },
      ]);
      const removalRuns = countWorkspaceLocks(prisma);
      const pause = await holdTransaction(prisma, (tx) => lockTaskForUpdate(tx, openTask));
      const removing = remove(managerId).then((response) => response);
      await waitForLockWaiter(prisma);
      // Assigned after the removal locked the member's tasks, so only its handover meets this one.
      await prisma.task.update({ where: { id: laterTask }, data: { assigneeId: managerId } });
      let deliveryPid = 0;
      const delivery = await holdSteppedTransaction(
        prisma,
        async (tx) => {
          const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          deliveryPid = row?.pid ?? 0;
          return lockTaskForUpdate(tx, laterTask);
        },
        (tx) => readMembershipForShare(tx, workspaceId, managerId),
      );

      await pause.commit();
      await waitForBlockedBy(prisma, deliveryPid);
      // The removal waits first, so Postgres ends the cycle by failing the removal.
      delivery.proceed();

      await expect(delivery.result).resolves.toHaveLength(1);
      expect((await removing).status).toBe(204);
      expect(removalRuns()).toBe(2);
      const tasks = await prisma.task.findMany({
        where: { id: { in: [openTask, laterTask] } },
        select: { assigneeId: true },
      });
      expect(tasks.map(({ assigneeId }) => assigneeId)).toEqual([ownerId, ownerId]);
    });
  });

  describe('with jobs running', () => {
    beforeAll(async () => {
      testApp = await createTestApp({ shouldRunJobs: true });
      prisma = testApp.app.get(PrismaService);
    });

    beforeEach(async () => {
      await flushValkey(inject('redisUrl'));
      await prepare();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should deliver the reminder to the receiver when a task with a pending reminder is handed over', async () => {
      await createTask(manager.http, {
        title: 'Call Romashka',
        dueAt: DUE_AT.toISOString(),
        remindAt: fromNow(REMINDER_DELAY_MS).toISOString(),
        assigneeId: manager.session.user.id,
      });

      await remove(manager.session.user.id).expect(204);

      await expect
        .poll(() => countNotifications(testApp, owner.session.user.id), { timeout: 15_000 })
        .toBe(1);
      expect(await countNotifications(testApp, manager.session.user.id)).toBe(0);
    });
  });
});
