import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import type { Task } from '@clientry/shared/tasks';

import type { PendingReminder } from './reminder-queue.js';
import type { RemindersRepository, RemindersTransaction } from './reminders.repository.js';
import { RemindersService } from './reminders.service.js';
import {
  createReminderQueueMock,
  MANAGER,
  TASK,
  WORKSPACE_ID,
} from '../../../test/support/task-doubles.js';
import type { ReminderQueueMock } from '../../../test/support/task-doubles.js';

const NOW = new Date('2026-10-15T06:00:01.000Z');

const DUE_TASK: Task = { ...TASK, assignee: { id: MANAGER.id, name: 'Max' } };

const JOB: PendingReminder = {
  workspaceId: WORKSPACE_ID,
  taskId: TASK.id,
  remindAt: '2026-10-15T06:00:00Z',
};

type TransactionMock = {
  readonly [K in keyof RemindersTransaction]: Mock<RemindersTransaction[K]>;
};

describe('RemindersService', () => {
  let tx: TransactionMock;
  let findPending: Mock<RemindersRepository['findPending']>;
  let queue: ReminderQueueMock;
  let service: RemindersService;
  let logSpy: MockInstance<Logger['log']>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    tx = {
      findTask: vi.fn<RemindersTransaction['findTask']>().mockResolvedValue(DUE_TASK),
      isMember: vi.fn<RemindersTransaction['isMember']>().mockResolvedValue(true),
      markSent: vi.fn<RemindersTransaction['markSent']>().mockResolvedValue(undefined),
      insertNotification: vi
        .fn<RemindersTransaction['insertNotification']>()
        .mockResolvedValue(undefined),
    };
    findPending = vi.fn<RemindersRepository['findPending']>().mockResolvedValue([]);
    const repository: RemindersRepository = { findPending, inTransaction: (work) => work(tx) };
    queue = createReminderQueueMock();
    service = new RemindersService(repository, queue);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('deliver', () => {
    it('should mark the reminder sent and notify the current assignee when it is pending', async () => {
      const outcome = await service.deliver(JOB);

      expect(outcome).toEqual({ isDelivered: true, userId: MANAGER.id });
      expect(tx.findTask).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id);
      expect(tx.isMember).toHaveBeenCalledWith(WORKSPACE_ID, MANAGER.id);
      expect(tx.markSent).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, NOW);
      expect(tx.insertNotification).toHaveBeenCalledExactlyOnceWith({
        workspaceId: WORKSPACE_ID,
        userId: MANAGER.id,
        taskId: TASK.id,
        event: {
          type: 'task_reminder',
          payload: { task: { id: TASK.id, title: TASK.title }, dueAt: TASK.dueAt },
        },
      });
    });

    it.each<[string, Partial<Task> | null, boolean]>([
      ['not_found', null, true],
      ['done', { doneAt: '2026-10-15T05:00:00.000Z' }, true],
      ['changed', { remindAt: '2026-10-15T07:00:00.000Z' }, true],
      ['changed', { remindAt: null }, true],
      ['sent', { reminderSentAt: '2026-10-15T06:00:00.500Z' }, true],
      ['not_member', {}, false],
    ])(
      'should write nothing and give %s when the check fails',
      async (reason, change, isMember) => {
        tx.findTask.mockResolvedValue(change === null ? null : { ...DUE_TASK, ...change });
        tx.isMember.mockResolvedValue(isMember);

        await expect(service.deliver(JOB)).resolves.toEqual({ isDelivered: false, reason });
        expect(tx.markSent).not.toHaveBeenCalled();
        expect(tx.insertNotification).not.toHaveBeenCalled();
      },
    );

    it('should write nothing and give too_late when the reminder is more than a day late', async () => {
      vi.setSystemTime(new Date('2026-10-16T06:00:00.001Z'));

      await expect(service.deliver(JOB)).resolves.toEqual({
        isDelivered: false,
        reason: 'too_late',
      });
      expect(tx.markSent).not.toHaveBeenCalled();
      expect(tx.insertNotification).not.toHaveBeenCalled();
    });

    it('should log ids and the reason and no title or times when a reminder is skipped', async () => {
      tx.findTask.mockResolvedValue({ ...DUE_TASK, doneAt: NOW.toISOString() });

      await service.deliver(JOB);

      expect(logSpy).toHaveBeenCalledWith(
        { taskId: TASK.id, workspaceId: WORKSPACE_ID, reason: 'done' },
        'Reminder skipped',
      );
      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain(TASK.title);
      expect(logged).not.toContain(TASK.dueAt);
    });
  });

  describe('sweep', () => {
    it('should queue every reminder the repository returns in the window when the sweep runs', async () => {
      findPending.mockResolvedValue([JOB]);

      await expect(service.sweep()).resolves.toBe(1);
      expect(findPending).toHaveBeenCalledWith({
        from: new Date('2026-10-14T06:00:01.000Z'),
        to: new Date('2026-10-15T08:00:01.000Z'),
      });
      expect(queue.schedule).toHaveBeenCalledWith([JOB]);
      expect(logSpy).toHaveBeenCalledWith({ count: 1 }, 'Reminder sweep done');
    });
  });
});
