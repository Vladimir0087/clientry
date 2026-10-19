import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildDemoWorkspace } from './demo-workspace.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { registerAccount } from '../../../test/fixtures/accounts.js';
import { createClient, insertClients } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds } from '../../../test/fixtures/deals.js';
import { enterDemo, resetDemo } from '../../../test/fixtures/demo.js';
import { createTask } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { holdTransaction, waitForLockWaiter } from '../../../test/support/held-transaction.js';
import { recordStatements } from '../../../test/support/statements.js';
import { TRUSTED_ORIGIN } from '../../../test/support/test-env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RemindersService } from '../tasks/reminders.service.js';
import { DEMO_WORKSPACE, PEOPLE } from './data/people.js';
import { DemoRepository } from './demo.repository.js';

const HOUR_MS = 60 * 60_000;
const UNKNOWN_ID = '0199a3c4-0000-7000-8000-000000000000';
const WORKSPACE_ID = DEMO_WORKSPACE.id;

interface DemoCounts {
  readonly stages: number;
  readonly clients: number;
  readonly deals: number;
  readonly tasks: number;
  readonly activities: number;
  readonly notifications: number;
}

function builtCounts(now: Date): DemoCounts {
  const demo = buildDemoWorkspace(now);
  return {
    stages: demo.stages.length,
    clients: demo.clients.length,
    deals: demo.deals.length,
    tasks: demo.tasks.length,
    activities: demo.activities.length,
    notifications: demo.notifications.length,
  };
}

describe('demo reset', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  async function countDemoRows(): Promise<DemoCounts> {
    const where = { workspaceId: WORKSPACE_ID };
    return {
      stages: await prisma.stage.count({ where }),
      clients: await prisma.client.count({ where }),
      deals: await prisma.deal.count({ where }),
      tasks: await prisma.task.count({ where }),
      activities: await prisma.activity.count({ where }),
      notifications: await prisma.notification.count({ where }),
    };
  }

  function demoMemberships(): Promise<unknown[]> {
    return prisma.membership.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { userId: 'asc' },
      select: { id: true, userId: true, role: true, createdAt: true },
    });
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

  it('should create the one demo workspace with its members, stages and records when the database is empty', async () => {
    const now = new Date();

    await resetDemo(testApp, now);

    const workspaces = await prisma.workspace.findMany({ where: { isDemo: true } });
    expect(workspaces).toEqual([
      expect.objectContaining({ id: WORKSPACE_ID, name: 'Pixel Studio', isDemo: true }),
    ]);
    const roles = await prisma.membership.findMany({
      where: { workspaceId: WORKSPACE_ID },
      select: { role: true },
    });
    expect(roles.map(({ role }) => role).toSorted()).toEqual([
      'manager',
      'manager',
      'manager',
      'manager',
      'owner',
    ]);
    const stages = await prisma.stage.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { position: 'asc' },
      select: { name: true, kind: true },
    });
    expect(stages.map(({ name }) => name)).toEqual([
      'New',
      'Call',
      'Proposal sent',
      'Contract',
      'Paid',
      'Lost',
    ]);
    expect(await countDemoRows()).toEqual(builtCounts(now));
  });

  it('should keep the workspace, users and join dates and drop what visitors added when it resets again', async () => {
    await resetDemo(testApp);
    const ids = await prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    const memberships = await demoMemberships();
    const owner = await enterDemo(testApp);
    const client = await createClient(owner.http, { name: 'Visitor client' });
    const stages = await findStageIds(testApp, WORKSPACE_ID);
    const deal = await createDeal(owner.http, {
      title: 'Visitor deal',
      clientId: client.id,
      stageId: stages.New,
      amount: 100_00,
      currency: 'USD',
      assigneeId: PEOPLE.ann.id,
    });
    const task = await createTask(owner.http, {
      title: 'Visitor task',
      dueAt: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
      assigneeId: PEOPLE.ann.id,
    });
    const registered = await registerAccount(testApp, 'Other Studio');
    const theirs = await createClient(registered.http, { name: 'Their client' });
    const now = new Date();

    await resetDemo(testApp, now);

    const demoUsers = await prisma.user.findMany({
      where: { id: { in: Object.values(PEOPLE).map(({ id }) => id) } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(demoUsers).toEqual(ids);
    expect(await demoMemberships()).toEqual(memberships);
    expect(await countDemoRows()).toEqual(builtCounts(now));
    expect(await prisma.client.findUnique({ where: { id: client.id } })).toBeNull();
    expect(await prisma.deal.findUnique({ where: { id: deal.id } })).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.client.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it('should keep a visitor signed in when the demo resets under their session', async () => {
    await resetDemo(testApp);
    const visitor = await enterDemo(testApp);

    await resetDemo(testApp);

    await visitor.http.get('/api/auth/me').expect(200);
    await visitor.http.post('/api/auth/refresh').set('Origin', TRUSTED_ORIGIN).expect(200);
  });

  it('should run the same statements in one transaction when a later reset follows records visitors added', async () => {
    const statements = recordStatements(prisma);
    await resetDemo(testApp);
    const first = statements.splice(0);
    await resetDemo(testApp);
    const second = statements.splice(0);
    await insertClients(
      testApp,
      WORKSPACE_ID,
      Array.from({ length: 50 }, (_, index) => ({
        name: `Visitor client ${String(index)}`,
        createdById: PEOPLE.max.id,
      })),
    );
    statements.splice(0);

    await resetDemo(testApp);

    const third = statements.splice(0);
    expect(third).toHaveLength(second.length);
    expect(first).toHaveLength(second.length + 2);
    expect(third.filter((query) => query === 'COMMIT')).toHaveLength(1);
    expect(third.at(-1)).toBe('COMMIT');
  });

  it('should roll everything back and keep the previous demo when a row breaks a foreign key', async () => {
    await resetDemo(testApp);
    const before = await countDemoRows();
    const clientIds = await prisma.client.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const demo = buildDemoWorkspace(new Date());
    const broken = {
      ...demo,
      notifications: demo.notifications.map((notification) => ({
        ...notification,
        taskId: UNKNOWN_ID,
      })),
    };

    await expect(
      testApp.app.get(DemoRepository).replace(broken, () => Promise.resolve('unusable')),
    ).rejects.toThrow(/foreign key/i);

    expect(await countDemoRows()).toEqual(before);
    expect(await prisma.client.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).toEqual(
      clientIds,
    );
  });

  it('should complete a write in the demo after the reset commits when the reset holds the workspace', async () => {
    await resetDemo(testApp);
    const owner = await enterDemo(testApp);
    const reset = await holdTransaction(
      prisma,
      (tx) => tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${WORKSPACE_ID}::uuid FOR UPDATE`,
    );

    const pending = owner.http
      .post('/api/clients')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Written during a reset' })
      .then((response) => response);
    await waitForLockWaiter(prisma);
    await reset.commit();

    expect((await pending).status).toBe(201);
  });

  it('should queue the future reminders in the sweep window and notify nobody again when a sweep follows a reset', async () => {
    const now = new Date();
    await resetDemo(testApp, now);
    const window = { from: now.getTime() - 24 * HOUR_MS, to: now.getTime() + 2 * HOUR_MS };
    const pending = buildDemoWorkspace(now).tasks.filter(
      ({ remindAt, reminderSentAt, doneAt }) =>
        remindAt !== null &&
        reminderSentAt === null &&
        doneAt === null &&
        remindAt.getTime() >= window.from &&
        remindAt.getTime() <= window.to,
    );

    const queued = await testApp.app.get(RemindersService).sweep();

    expect(pending.length).toBeGreaterThan(0);
    expect(queued).toBe(pending.length);
    expect(await prisma.notification.count()).toBe(7);
  });
});
