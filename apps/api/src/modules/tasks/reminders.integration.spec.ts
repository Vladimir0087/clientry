import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { reminderJobId } from './bullmq-reminder-queue.js';
import { REMINDERS_QUEUE_TOKEN, SWEEP_REMINDERS_JOB } from './reminder-jobs.js';
import { ReminderQueue } from './reminder-queue.js';
import type { PendingReminder } from './reminder-queue.js';
import { RemindersService } from './reminders.service.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds } from '../../../test/fixtures/deals.js';
import { countNotifications } from '../../../test/fixtures/notifications.js';
import { createTask, insertTasks } from '../../../test/fixtures/tasks.js';
import type { TaskSeed } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { holdTransaction, waitForLockWaiter } from '../../../test/support/held-transaction.js';
import { flushValkey } from '../../../test/support/valkey.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DUE_AT = new Date('2030-03-15T12:00:00.000Z');

function fromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe('reminders', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let queue: Queue;
  let owner: TestAccount;

  async function createApp(shouldRunJobs: boolean): Promise<void> {
    testApp = await createTestApp({ shouldRunJobs });
    prisma = testApp.app.get(PrismaService);
    queue = testApp.app.get<Queue>(REMINDERS_QUEUE_TOKEN);
  }

  async function seed(
    seeds: readonly Omit<TaskSeed, 'createdById' | 'dueAt'>[],
  ): Promise<string[]> {
    const createdById = owner.session.user.id;
    return insertTasks(
      testApp,
      owner.session.workspace.id,
      seeds.map((task) => ({ createdById, dueAt: DUE_AT, ...task })),
    );
  }

  function reminderOf(taskId: string, remindAt: Date): PendingReminder {
    return { workspaceId: owner.session.workspace.id, taskId, remindAt: remindAt.toISOString() };
  }

  async function hasJob(reminder: PendingReminder): Promise<boolean> {
    return (await queue.getJob(reminderJobId(reminder))) !== undefined;
  }

  // A task linked to the deal is hidden by deleting what the returned path names.
  async function dealTaskHiddenBy(target: 'deal' | 'client'): Promise<{
    readonly dealId: string;
    readonly hidePath: string;
  }> {
    const client = await createClient(owner.http, { name: 'Romashka LLC' });
    const stages = await findStageIds(testApp, owner.session.workspace.id);
    const deal = await createDeal(owner.http, {
      title: 'Landing page',
      clientId: client.id,
      stageId: stages.New,
      amount: 150_000,
      currency: 'USD',
      assigneeId: owner.session.user.id,
    });
    const hidePath = target === 'deal' ? `/api/deals/${deal.id}` : `/api/clients/${client.id}`;
    return { dealId: deal.id, hidePath };
  }

  async function prepare(): Promise<void> {
    await resetDatabase(prisma);
    await flushValkey(inject('redisUrl'));
    owner = await registerAccount(testApp, 'Pixel Studio');
  }

  describe('with jobs running', () => {
    beforeAll(async () => {
      await createApp(true);
    });

    beforeEach(prepare);

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should notify the assignee and mark the reminder sent when its time comes', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const task = await createTask(owner.http, {
        title: 'Call Romashka',
        dueAt: DUE_AT.toISOString(),
        remindAt: fromNow(2000).toISOString(),
        assigneeId: manager.session.user.id,
      });

      await expect
        .poll(() => countNotifications(testApp, manager.session.user.id), { timeout: 10_000 })
        .toBe(1);
      const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(stored.reminderSentAt).not.toBeNull();
      expect(stored.updatedAt.toISOString()).toBe(task.updatedAt);
    });

    it('should queue the pending reminders again when a tick runs after Valkey lost its data', async () => {
      const remindAt = fromNow(30 * MINUTE_MS);
      const [id = ''] = await seed([{ remindAt }]);
      await flushValkey(inject('redisUrl'));

      await testApp.app.get(RecurringJobs).tick();

      await expect.poll(() => hasJob(reminderOf(id, remindAt)), { timeout: 10_000 }).toBe(true);
    });

    it('should add no sweep when a tick runs within the hour after a sweep finished', async () => {
      const clock = testApp.app.get(RecurringJobs);
      await clock.tick();
      const sweepId = await queue.getDeduplicationJobId(SWEEP_REMINDERS_JOB);
      await expect
        .poll(() => queue.getJobCounts('wait', 'active'), { timeout: 10_000 })
        .toEqual({ wait: 0, active: 0 });

      await clock.tick();

      expect(sweepId).toEqual(expect.any(String));
      expect(await queue.getDeduplicationJobId(SWEEP_REMINDERS_JOB)).toBe(sweepId);
    });
  });

  describe('with jobs stopped', () => {
    let reminders: RemindersService;

    beforeAll(async () => {
      await createApp(false);
      reminders = testApp.app.get(RemindersService);
    });

    beforeEach(prepare);

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should leave a delayed job when a task with a reminder within the horizon is created', async () => {
      const remindAt = fromNow(30 * MINUTE_MS);

      const task = await createTask(owner.http, {
        title: 'Call Romashka',
        dueAt: DUE_AT.toISOString(),
        remindAt: remindAt.toISOString(),
        assigneeId: owner.session.user.id,
      });

      const job = await queue.getJob(reminderJobId(reminderOf(task.id, remindAt)));
      expect(await job?.getState()).toBe('delayed');
    });

    it('should leave one job when the same reminder is queued twice', async () => {
      const reminder = reminderOf('0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a', fromNow(HOUR_MS));
      const reminderQueue = testApp.app.get(ReminderQueue);

      await reminderQueue.schedule([reminder]);
      await reminderQueue.schedule([reminder]);

      expect(await queue.getJobCounts('delayed')).toEqual({ delayed: 1 });
    });

    it('should leave one waiting sweep when two ticks run within an hour', async () => {
      const clock = testApp.app.get(RecurringJobs);

      await clock.tick();
      await clock.tick();

      expect(await queue.getJobCounts('wait')).toEqual({ wait: 1 });
    });

    it('should deliver one notification when one reminder is delivered twice', async () => {
      const remindAt = fromNow(-MINUTE_MS);
      const [id = ''] = await seed([{ remindAt }]);

      await reminders.deliver(reminderOf(id, remindAt));
      const second = await reminders.deliver(reminderOf(id, remindAt));

      expect(second).toEqual({ isDelivered: false, reason: 'sent' });
      expect(await countNotifications(testApp, owner.session.user.id)).toBe(1);
    });

    it('should notify the new assignee when the task is reassigned during the delivery', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const remindAt = fromNow(-MINUTE_MS);
      const [id = ''] = await seed([{ remindAt }]);
      const reassign = await holdTransaction(prisma, (tx) =>
        tx.task.update({ where: { id }, data: { assigneeId: manager.session.user.id } }),
      );

      const delivering = reminders.deliver(reminderOf(id, remindAt));
      await waitForLockWaiter(prisma);
      await reassign.commit();

      await expect(delivering).resolves.toEqual({
        isDelivered: true,
        userId: manager.session.user.id,
      });
    });

    it('should store the task snapshot in the notification when a reminder is delivered', async () => {
      const remindAt = fromNow(-MINUTE_MS);
      const [id = ''] = await seed([{ remindAt, title: 'Send the proposal' }]);

      await reminders.deliver(reminderOf(id, remindAt));

      const notification = await prisma.notification.findFirstOrThrow({ where: { taskId: id } });
      expect(notification).toMatchObject({
        workspaceId: owner.session.workspace.id,
        userId: owner.session.user.id,
        type: 'task_reminder',
        readAt: null,
        payload: { task: { id, title: 'Send the proposal' }, dueAt: DUE_AT.toISOString() },
      });
    });

    describe('skips', () => {
      const remindAt = fromNow(-MINUTE_MS);

      async function expectSkipped(taskId: string, reason: string, at = remindAt): Promise<void> {
        await expect(reminders.deliver(reminderOf(taskId, at))).resolves.toEqual({
          isDelivered: false,
          reason,
        });
        expect(await prisma.notification.count()).toBe(0);
        const stored = await prisma.task.findUnique({ where: { id: taskId } });
        expect(stored?.reminderSentAt ?? null).toBeNull();
      }

      it('should give changed when the job carries an old reminder time', async () => {
        const [id = ''] = await seed([{ remindAt }]);

        await expectSkipped(id, 'changed', fromNow(-2 * MINUTE_MS));
      });

      it('should give done when the task is done', async () => {
        const [id = ''] = await seed([{ remindAt, doneAt: new Date() }]);

        await expectSkipped(id, 'done');
      });

      it('should give not_found when the task is deleted', async () => {
        const [id = ''] = await seed([{ remindAt, deletedAt: new Date() }]);

        await expectSkipped(id, 'not_found');
      });

      it('should give not_found when the task is hidden with its client', async () => {
        const client = await createClient(owner.http, { name: 'Romashka LLC' });
        const [id = ''] = await seed([{ remindAt, clientId: client.id }]);
        await owner.http.delete(`/api/clients/${client.id}`).expect(204);

        await expectSkipped(id, 'not_found');
      });

      it.each(['deal', 'client'] as const)(
        'should give not_found when the task is hidden with its deal through its %s',
        async (target) => {
          const { dealId, hidePath } = await dealTaskHiddenBy(target);
          const [id = ''] = await seed([{ remindAt, dealId }]);
          await owner.http.delete(hidePath).expect(204);

          await expectSkipped(id, 'not_found');
        },
      );

      it('should give not_found when the job names another workspace', async () => {
        const stranger = await registerAccount(testApp, 'Other Studio');
        const [id = ''] = await seed([{ remindAt }]);

        await expect(
          reminders.deliver({
            ...reminderOf(id, remindAt),
            workspaceId: stranger.session.workspace.id,
          }),
        ).resolves.toEqual({ isDelivered: false, reason: 'not_found' });
      });

      it('should give too_late when the reminder is more than a day late', async () => {
        const late = fromNow(-25 * HOUR_MS);
        const [id = ''] = await seed([{ remindAt: late }]);

        await expectSkipped(id, 'too_late', late);
      });

      it('should give not_member when the assignee left the workspace', async () => {
        const manager = await addManager(testApp, owner.session.workspace.id);
        const [id = ''] = await seed([{ remindAt, assigneeId: manager.session.user.id }]);
        await prisma.membership.delete({ where: { userId: manager.session.user.id } });

        await expectSkipped(id, 'not_member');
      });
    });

    it('should queue only pending reminders inside the window when the sweep runs', async () => {
      const client = await createClient(owner.http, { name: 'Romashka LLC' });
      const soon = fromNow(30 * MINUTE_MS);
      const late = fromNow(-HOUR_MS);
      const far = fromNow(3 * HOUR_MS);
      const stale = fromNow(-25 * HOUR_MS);
      const ids = await seed([
        { remindAt: soon },
        { remindAt: late },
        { remindAt: far },
        { remindAt: stale },
        { remindAt: soon, reminderSentAt: new Date() },
        { remindAt: soon, doneAt: new Date() },
        { remindAt: soon, deletedAt: new Date() },
        { remindAt: soon, clientId: client.id },
      ]);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);
      const times = [soon, late, far, stale, soon, soon, soon, soon];

      await expect(reminders.sweep()).resolves.toBe(2);

      const queued = await Promise.all(
        ids.map((id, index) => hasJob(reminderOf(id, times[index] ?? soon))),
      );
      expect(queued).toEqual([true, true, false, false, false, false, false, false]);
    });

    it.each(['deal', 'client'] as const)(
      'should leave out a reminder hidden with its deal through its %s when the sweep runs',
      async (target) => {
        const { dealId, hidePath } = await dealTaskHiddenBy(target);
        await seed([{ remindAt: fromNow(30 * MINUTE_MS), dealId }]);
        await owner.http.delete(hidePath).expect(204);

        await expect(reminders.sweep()).resolves.toBe(0);
      },
    );
  });
});
