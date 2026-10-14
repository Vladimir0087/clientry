import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { dealHistoryResponseSchema } from '@clientry/shared/deals';

import { ActivityLog } from './activity-log.repository.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { parseFeed } from '../../../test/fixtures/activity.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds } from '../../../test/fixtures/deals.js';
import { createTask } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { TRUSTED_ORIGIN } from '../../../test/support/test-env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const DUE_AT = '2030-03-15T12:00:00.000Z';

interface ForeignKeyRow {
  readonly table: string;
  readonly on_delete: string;
}

describe('activity writers', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let ownerId: string;

  async function setDone(taskId: string, action: 'complete' | 'reopen'): Promise<void> {
    await owner.http
      .post(`/api/tasks/${taskId}/${action}`)
      .set('Origin', TRUSTED_ORIGIN)
      .expect(200);
  }

  async function taskTypes(taskId: string): Promise<string[]> {
    const rows = await prisma.activity.findMany({ where: { taskId }, select: { type: true } });
    return rows.map(({ type }) => type);
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    ownerId = owner.session.user.id;
    manager = await addManager(testApp, owner.session.workspace.id);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should write one client_created entry with the creator as actor when a client is created', async () => {
    const client = await createClient(manager.http);

    const rows = await prisma.activity.findMany({ where: { clientId: client.id } });

    expect(rows).toMatchObject([
      {
        type: 'client_created',
        actorId: manager.session.user.id,
        dealId: null,
        taskId: null,
        payload: {},
      },
    ]);
  });

  it("should write task_created with the assignee's name when a task is created", async () => {
    const task = await createTask(owner.http, {
      title: 'Call back',
      dueAt: DUE_AT,
      assigneeId: manager.session.user.id,
    });

    const { items } = parseFeed(await owner.http.get('/api/activity'));

    expect(items.find(({ type }) => type === 'task_created')).toMatchObject({
      actor: { id: ownerId, name: 'Ann' },
      subject: { kind: 'task', id: task.id, label: 'Call back', isAvailable: true },
      payload: { assignee: { id: manager.session.user.id, name: 'Max' }, dueAt: DUE_AT },
    });
  });

  it('should write task_completed once when a task is completed, completed again and reopened', async () => {
    const task = await createTask(owner.http, {
      title: 'Call back',
      dueAt: DUE_AT,
      assigneeId: ownerId,
    });

    await setDone(task.id, 'complete');
    await setDone(task.id, 'complete');
    await setDone(task.id, 'reopen');

    expect((await taskTypes(task.id)).toSorted()).toEqual(['task_completed', 'task_created']);
  });

  it('should keep task events out of the deal history when a task of the deal is completed', async () => {
    const client = await createClient(owner.http);
    const stages = await findStageIds(testApp, owner.session.workspace.id);
    const deal = await createDeal(owner.http, {
      title: 'Landing page',
      clientId: client.id,
      stageId: stages.New,
      amount: 100_00,
      currency: 'USD',
      assigneeId: ownerId,
    });
    const task = await createTask(owner.http, {
      title: 'Call back',
      dueAt: DUE_AT,
      assigneeId: ownerId,
      related: { kind: 'deal', id: deal.id },
    });
    await setDone(task.id, 'complete');

    const response = await owner.http.get(`/api/deals/${deal.id}/history`).expect(200);

    expect(dealHistoryResponseSchema.parse(response.body).items.map(({ type }) => type)).toEqual([
      'deal_created',
    ]);
  });

  describe('schema', () => {
    it('should reference clients and tasks with NO ACTION when the foreign keys are read', async () => {
      const rows = await prisma.$queryRaw<ForeignKeyRow[]>`
        SELECT confrelid::regclass::text AS table,
          CASE confdeltype WHEN 'a' THEN 'NO ACTION' ELSE confdeltype::text END AS on_delete
        FROM pg_constraint
        WHERE conrelid = 'activities'::regclass AND contype = 'f'
          AND confrelid IN ('clients'::regclass, 'tasks'::regclass, 'deals'::regclass)
        ORDER BY 1`;

      expect(rows).toEqual([
        { table: 'clients', on_delete: 'NO ACTION' },
        { table: 'deals', on_delete: 'NO ACTION' },
        { table: 'tasks', on_delete: 'NO ACTION' },
      ]);
    });

    it('should allow a null deal_id when the column is read', async () => {
      const [column] = await prisma.$queryRaw<{ is_nullable: string }[]>`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'deal_id'`;

      expect(column?.is_nullable).toBe('YES');
    });

    it('should have the feed index when the indexes are read', async () => {
      const [index] = await prisma.$queryRaw<{ definition: string }[]>`
        SELECT indexdef AS definition FROM pg_indexes
        WHERE tablename = 'activities' AND indexname = 'activities_workspace_id_created_at_id_idx'`;

      expect(index?.definition).toContain('(workspace_id, created_at, id)');
    });
  });
});

describe('activity writers when the log fails', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;

  beforeAll(async () => {
    const failingLog = {
      record: (): Promise<void> => Promise.reject(new Error('Activity log is down')),
    };
    testApp = await createTestApp({ providers: [{ token: ActivityLog, value: failingLog }] });
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should answer 500 and leave no client row when the entry of a client create fails', async () => {
    const response = await owner.http
      .post('/api/clients')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Romashka LLC' });

    expect(response.status).toBe(500);
    expect(await prisma.client.count()).toBe(0);
  });

  it('should answer 500 and leave no task row when the entry of a task create fails', async () => {
    const response = await owner.http
      .post('/api/tasks')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ title: 'Call back', dueAt: DUE_AT, assigneeId: owner.session.user.id });

    expect(response.status).toBe(500);
    expect(await prisma.task.count()).toBe(0);
  });
});
