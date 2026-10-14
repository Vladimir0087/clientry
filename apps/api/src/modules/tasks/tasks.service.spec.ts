import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { CreateTaskRequest } from '@clientry/shared/tasks';

import { TaskDeleteForbiddenError, TaskNotFoundError } from './errors.js';
import { encodeTaskCursor } from './task-cursor.js';
import { TasksService } from './tasks.service.js';
import {
  CLIENT_REF,
  createTaskRepositoryMock,
  createReminderQueueMock,
  createTaskTransactionMock,
  DEAL_REF,
  MANAGER,
  OWNER,
  TASK,
  WORKSPACE_ID,
} from '../../../test/support/task-doubles.js';
import type {
  ReminderQueueMock,
  TaskRepositoryMock,
  TaskTransactionMock,
} from '../../../test/support/task-doubles.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

const NOW = new Date('2026-10-14T10:00:00.000Z');
const PAST = '2026-10-14T09:59:59.999Z';
const FUTURE = '2026-10-15T07:00:00.000Z';
// Within the two-hour horizon, so the reminder is queued at once.
const SOON = '2026-10-14T11:00:00.000Z';

const INPUT: CreateTaskRequest = {
  title: TASK.title,
  dueAt: TASK.dueAt,
  remindAt: TASK.remindAt,
  assigneeId: OWNER.id,
  related: { kind: 'client', id: CLIENT_REF.id },
};

describe('TasksService', () => {
  let tx: TaskTransactionMock;
  let repository: TaskRepositoryMock;
  let reminders: ReminderQueueMock;
  let service: TasksService;
  let logSpy: MockInstance<Logger['log']>;

  function ownedBy(user: AuthUser, isDeleted = false): void {
    tx.findOwnership.mockResolvedValue({ createdById: user.id, isDeleted, isHidden: false });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    tx = createTaskTransactionMock();
    repository = createTaskRepositoryMock(tx);
    reminders = createReminderQueueMock();
    service = new TasksService(repository, reminders);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should pass the workspace, the caller and the fields when a task is created', async () => {
      await service.create(MANAGER, INPUT);

      expect(tx.create).toHaveBeenCalledWith(WORKSPACE_ID, MANAGER.id, {
        title: INPUT.title,
        dueAt: INPUT.dueAt,
        remindAt: INPUT.remindAt,
        assigneeId: OWNER.id,
        related: { kind: 'client', id: CLIENT_REF.id },
      });
    });

    it('should record task_created with the assignee snapshot of the created task when a task is created', async () => {
      await service.create(MANAGER, INPUT);

      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, MANAGER.id, {
        type: 'task_created',
        payload: { assignee: TASK.assignee, dueAt: TASK.dueAt },
      });
    });

    it('should store no reminder and no link when both are left out', async () => {
      await service.create(OWNER, { title: 'Call', dueAt: TASK.dueAt, assigneeId: OWNER.id });

      expect(tx.create.mock.calls[0]?.[2]).toMatchObject({ remindAt: null, related: null });
    });

    it.each([
      ['assigneeId', 'Choose a member', INPUT, (mock: TaskTransactionMock) => mock.findMember],
      ['related.id', 'Choose a client', INPUT, (mock: TaskTransactionMock) => mock.findClient],
      [
        'related.id',
        'Choose a deal',
        { ...INPUT, related: { kind: 'deal', id: DEAL_REF.id } },
        (mock: TaskTransactionMock) => mock.findDeal,
      ],
    ] as const)(
      'should throw RequestValidationError on %s with "%s" and write nothing when it is not found',
      async (path, message, input, lookup) => {
        lookup(tx).mockResolvedValue(null);

        const result = service.create(OWNER, input);

        await expect(result).rejects.toBeInstanceOf(RequestValidationError);
        await expect(result).rejects.toMatchObject({ fieldErrors: [{ path, message }] });
        expect(tx.create).not.toHaveBeenCalled();
      },
    );

    it('should look up the deal and not the client when the task links a deal', async () => {
      await service.create(OWNER, { ...INPUT, related: { kind: 'deal', id: DEAL_REF.id } });

      expect(tx.findDeal).toHaveBeenCalledWith(WORKSPACE_ID, DEAL_REF.id);
      expect(tx.findClient).not.toHaveBeenCalled();
    });

    it.each([PAST, NOW.toISOString()])(
      'should throw RequestValidationError on remindAt and write nothing when it is %s',
      async (remindAt) => {
        const result = service.create(OWNER, { ...INPUT, remindAt });

        await expect(result).rejects.toMatchObject({
          fieldErrors: [{ path: 'remindAt', message: 'Choose a time in the future' }],
        });
        expect(tx.create).not.toHaveBeenCalled();
      },
    );

    it('should name the reminder and the assignee in one error when both are invalid', async () => {
      tx.findMember.mockResolvedValue(null);

      const result = service.create(OWNER, { ...INPUT, remindAt: PAST });

      await expect(result).rejects.toMatchObject({
        fieldErrors: [
          { path: 'remindAt', message: 'Choose a time in the future' },
          { path: 'assigneeId', message: 'Choose a member' },
        ],
      });
    });

    it('should accept a past due time when the task is created', async () => {
      await service.create(OWNER, { ...INPUT, dueAt: PAST, remindAt: null });

      expect(tx.create).toHaveBeenCalled();
    });

    it('should log ids and no title or times when a task is created', async () => {
      await service.create(OWNER, INPUT);

      expect(logSpy).toHaveBeenCalledWith(
        { taskId: TASK.id, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Task created',
      );
      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain(TASK.title);
      expect(logged).not.toContain(TASK.dueAt);
    });
  });

  describe('missing task', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(null);
      tx.findById.mockResolvedValue(null);
      tx.findOwnership.mockResolvedValue(null);
    });

    it.each([
      ['get', (s: TasksService) => s.get(OWNER, TASK.id)],
      ['update', (s: TasksService) => s.update(OWNER, TASK.id, { title: 'New' })],
      ['complete', (s: TasksService) => s.complete(OWNER, TASK.id)],
      ['reopen', (s: TasksService) => s.reopen(OWNER, TASK.id)],
      ['delete', (s: TasksService) => s.delete(OWNER, TASK.id)],
      ['restore', (s: TasksService) => s.restore(OWNER, TASK.id)],
    ])('should throw TaskNotFoundError when %s finds nothing', async (_case, call) => {
      await expect(call(service)).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it.each([
      ['delete', (s: TasksService) => s.delete(OWNER, TASK.id)],
      ['restore', (s: TasksService) => s.restore(OWNER, TASK.id)],
    ])(
      'should throw TaskNotFoundError and write nothing when %s meets a hidden task',
      async (_case, call) => {
        tx.findOwnership.mockResolvedValue({
          createdById: OWNER.id,
          isDeleted: true,
          isHidden: true,
        });

        await expect(call(service)).rejects.toBeInstanceOf(TaskNotFoundError);
        expect(tx.softDelete).not.toHaveBeenCalled();
        expect(tx.restore).not.toHaveBeenCalled();
      },
    );
  });

  describe('update', () => {
    it('should return the task and write nothing when every sent value is the stored one', async () => {
      const task = await service.update(OWNER, TASK.id, {
        title: TASK.title,
        remindAt: TASK.remindAt,
        related: { kind: 'client', id: CLIENT_REF.id },
      });

      expect(task).toEqual(TASK);
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('should send only the changed fields when some fields change', async () => {
      await service.update(OWNER, TASK.id, { title: 'Shop', dueAt: TASK.dueAt });

      expect(tx.update).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, {
        title: 'Shop',
        dueAt: undefined,
        remindAt: undefined,
        assigneeId: undefined,
        related: undefined,
      });
    });

    it('should accept the stored past reminder when it is sent unchanged', async () => {
      tx.findById.mockResolvedValue({ ...TASK, remindAt: PAST });

      await service.update(OWNER, TASK.id, { remindAt: PAST, title: 'Shop' });

      expect(tx.update).toHaveBeenCalled();
    });

    it('should throw RequestValidationError on remindAt and write nothing when it changes to a past time', async () => {
      const result = service.update(OWNER, TASK.id, { remindAt: PAST });

      await expect(result).rejects.toMatchObject({ fieldErrors: [{ path: 'remindAt' }] });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it.each([FUTURE, null])(
      'should clear reminderSentAt when remindAt changes to %s',
      async (remindAt) => {
        tx.findById.mockResolvedValue({ ...TASK, reminderSentAt: TASK.remindAt });

        await service.update(OWNER, TASK.id, { remindAt });

        expect(tx.update.mock.calls[0]?.[2]).toMatchObject({ remindAt, reminderSentAt: null });
      },
    );

    it('should keep reminderSentAt when only the due time changes', async () => {
      await service.update(OWNER, TASK.id, { dueAt: FUTURE });

      expect(tx.update.mock.calls[0]?.[2]).not.toHaveProperty('reminderSentAt');
    });

    it('should throw RequestValidationError on assigneeId and write nothing when the new assignee is not a member', async () => {
      tx.findMember.mockResolvedValue(null);

      const result = service.update(OWNER, TASK.id, { assigneeId: MANAGER.id });

      await expect(result).rejects.toMatchObject({
        fieldErrors: [{ path: 'assigneeId', message: 'Choose a member' }],
      });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it.each([
      ['Choose a client', CLIENT_REF.id, 'client', (mock: TaskTransactionMock) => mock.findClient],
      ['Choose a deal', DEAL_REF.id, 'deal', (mock: TaskTransactionMock) => mock.findDeal],
    ] as const)(
      'should throw RequestValidationError on related.id with "%s" and write nothing when the new link is not found',
      async (message, id, kind, lookup) => {
        tx.findById.mockResolvedValue({ ...TASK, related: null });
        lookup(tx).mockResolvedValue(null);

        const result = service.update(OWNER, TASK.id, { related: { kind, id } });

        await expect(result).rejects.toMatchObject({
          fieldErrors: [{ path: 'related.id', message }],
        });
        expect(tx.update).not.toHaveBeenCalled();
      },
    );

    it('should check only the references that change when the task is edited', async () => {
      await service.update(OWNER, TASK.id, { title: 'Shop', assigneeId: OWNER.id });

      expect(tx.findMember).not.toHaveBeenCalled();
      expect(tx.findClient).not.toHaveBeenCalled();
    });

    it('should throw TaskNotFoundError when the conditional update matches nothing', async () => {
      tx.update.mockResolvedValue(null);

      await expect(service.update(OWNER, TASK.id, { title: 'Shop' })).rejects.toBeInstanceOf(
        TaskNotFoundError,
      );
    });
  });

  describe('complete and reopen', () => {
    it('should set doneAt to now and log when an open task is completed', async () => {
      await service.complete(MANAGER, TASK.id);

      expect(tx.update).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, {
        doneAt: NOW.toISOString(),
      });
      expect(logSpy).toHaveBeenCalledWith(
        { taskId: TASK.id, workspaceId: WORKSPACE_ID, userId: MANAGER.id },
        'Task completed',
      );
    });

    it('should keep the first doneAt and write nothing when a done task is completed again', async () => {
      const done = { ...TASK, doneAt: '2026-10-13T08:00:00.000Z' };
      tx.findById.mockResolvedValue(done);

      await expect(service.complete(OWNER, TASK.id)).resolves.toEqual(done);
      expect(tx.update).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should record task_completed when an open task is completed', async () => {
      await service.complete(MANAGER, TASK.id);

      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, MANAGER.id, {
        type: 'task_completed',
        payload: {},
      });
    });

    it('should record nothing when a done task is completed again', async () => {
      tx.findById.mockResolvedValue({ ...TASK, doneAt: '2026-10-13T08:00:00.000Z' });

      await service.complete(OWNER, TASK.id);

      expect(tx.addActivity).not.toHaveBeenCalled();
    });

    it('should record nothing when a done task is reopened', async () => {
      tx.findById.mockResolvedValue({ ...TASK, doneAt: '2026-10-13T08:00:00.000Z' });

      await service.reopen(OWNER, TASK.id);

      expect(tx.addActivity).not.toHaveBeenCalled();
    });

    it('should clear doneAt and log when a done task is reopened', async () => {
      tx.findById.mockResolvedValue({ ...TASK, doneAt: '2026-10-13T08:00:00.000Z' });

      await service.reopen(OWNER, TASK.id);

      expect(tx.update).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id, { doneAt: null });
      expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'Task reopened');
    });

    it('should write nothing when an open task is reopened', async () => {
      await expect(service.reopen(OWNER, TASK.id)).resolves.toEqual(TASK);
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('should throw RequestValidationError on assigneeId and write nothing when the assignee of a reopened task is no member', async () => {
      tx.findById.mockResolvedValue({ ...TASK, doneAt: '2026-10-13T08:00:00.000Z' });
      tx.findMember.mockResolvedValue(null);

      const result = service.reopen(OWNER, TASK.id);

      await expect(result).rejects.toBeInstanceOf(RequestValidationError);
      await expect(result).rejects.toMatchObject({
        fieldErrors: [{ path: 'assigneeId', message: 'Choose a member' }],
      });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('should check no membership when a task is completed', async () => {
      await service.complete(OWNER, TASK.id);

      expect(tx.findMember).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should throw TaskDeleteForbiddenError and write nothing when a manager deletes another user task', async () => {
      ownedBy(OWNER);

      await expect(service.delete(MANAGER, TASK.id)).rejects.toBeInstanceOf(
        TaskDeleteForbiddenError,
      );
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it.each([
      ['a manager deletes their own task', MANAGER, MANAGER],
      ['the owner deletes a manager task', OWNER, MANAGER],
    ])('should delete and log when %s', async (_case, user, creator) => {
      ownedBy(creator);

      await service.delete(user, TASK.id);

      expect(tx.softDelete).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id);
      expect(logSpy).toHaveBeenCalledWith(
        { taskId: TASK.id, workspaceId: WORKSPACE_ID, userId: user.id },
        'Task deleted',
      );
    });

    it('should throw TaskNotFoundError when the task is already deleted', async () => {
      ownedBy(OWNER, true);

      await expect(service.delete(OWNER, TASK.id)).rejects.toBeInstanceOf(TaskNotFoundError);
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it('should throw TaskNotFoundError when a concurrent delete wins', async () => {
      tx.softDelete.mockResolvedValue(false);

      await expect(service.delete(OWNER, TASK.id)).rejects.toBeInstanceOf(TaskNotFoundError);
    });
  });

  describe('restore', () => {
    it('should throw TaskDeleteForbiddenError and write nothing when a manager restores another user task', async () => {
      ownedBy(OWNER, true);

      await expect(service.restore(MANAGER, TASK.id)).rejects.toBeInstanceOf(
        TaskDeleteForbiddenError,
      );
      expect(tx.restore).not.toHaveBeenCalled();
    });

    it('should restore, return the task and log when a deleted task is restored', async () => {
      ownedBy(MANAGER, true);

      await expect(service.restore(MANAGER, TASK.id)).resolves.toEqual(TASK);
      expect(tx.restore).toHaveBeenCalledWith(WORKSPACE_ID, TASK.id);
      expect(logSpy).toHaveBeenCalledWith(
        { taskId: TASK.id, workspaceId: WORKSPACE_ID, userId: MANAGER.id },
        'Task restored',
      );
    });

    it('should return the task without writing when it is active', async () => {
      ownedBy(OWNER);

      await expect(service.restore(OWNER, TASK.id)).resolves.toEqual(TASK);
      expect(tx.restore).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('reminder scheduling', () => {
    const SOON_TASK = { ...TASK, remindAt: SOON };
    const PENDING = { workspaceId: WORKSPACE_ID, taskId: TASK.id, remindAt: SOON };

    it('should queue the reminder when a created task has one within the horizon', async () => {
      tx.create.mockResolvedValue(SOON_TASK);

      await service.create(OWNER, { ...INPUT, remindAt: SOON });

      expect(reminders.schedule).toHaveBeenCalledWith([PENDING]);
    });

    it.each([
      ['created', (): Promise<unknown> => service.create(OWNER, { ...INPUT, remindAt: SOON })],
      ['edited', (): Promise<unknown> => service.update(OWNER, TASK.id, { remindAt: SOON })],
    ])('should queue the reminder after the commit when a task is %s', async (_, write) => {
      const events: string[] = [];
      tx.create.mockResolvedValue(SOON_TASK);
      tx.update.mockResolvedValue(SOON_TASK);
      reminders.schedule.mockImplementation(() => {
        events.push('schedule');
        return Promise.resolve();
      });
      service = new TasksService(
        {
          ...repository,
          inTransaction: async (work) => {
            const result = await work(tx);
            events.push('commit');
            return result;
          },
        },
        reminders,
      );

      await write();

      expect(events).toEqual(['commit', 'schedule']);
    });

    it('should not queue the reminder when it lies beyond the horizon', async () => {
      await service.create(OWNER, INPUT);

      expect(reminders.schedule).not.toHaveBeenCalled();
    });

    it('should return the task and log a warning with ids when queueing fails', async () => {
      tx.create.mockResolvedValue(SOON_TASK);
      reminders.schedule.mockRejectedValue(new Error('Connection is closed'));
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.create(OWNER, { ...INPUT, remindAt: SOON })).resolves.toEqual(SOON_TASK);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: TASK.id, workspaceId: WORKSPACE_ID }),
        'Could not queue a reminder',
      );
    });

    it('should queue the reminder when an edit changes the task', async () => {
      tx.update.mockResolvedValue(SOON_TASK);

      await service.update(OWNER, TASK.id, { remindAt: SOON });

      expect(reminders.schedule).toHaveBeenCalledWith([PENDING]);
    });

    it('should not queue anything when an edit changes nothing', async () => {
      tx.findById.mockResolvedValue(SOON_TASK);

      await service.update(OWNER, TASK.id, { remindAt: SOON });

      expect(reminders.schedule).not.toHaveBeenCalled();
    });

    it('should queue the reminder when a done task is reopened', async () => {
      tx.findById.mockResolvedValue({ ...SOON_TASK, doneAt: '2026-10-13T08:00:00.000Z' });
      tx.update.mockResolvedValue(SOON_TASK);

      await service.reopen(OWNER, TASK.id);

      expect(reminders.schedule).toHaveBeenCalledWith([PENDING]);
    });

    it('should not queue the reminder when a task is completed', async () => {
      tx.findById.mockResolvedValue(SOON_TASK);
      tx.update.mockResolvedValue({ ...SOON_TASK, doneAt: NOW.toISOString() });

      await service.complete(OWNER, TASK.id);

      expect(reminders.schedule).not.toHaveBeenCalled();
    });

    it('should queue the reminder when a deleted task is restored', async () => {
      ownedBy(OWNER, true);
      tx.findById.mockResolvedValue(SOON_TASK);

      await service.restore(OWNER, TASK.id);

      expect(reminders.schedule).toHaveBeenCalledWith([PENDING]);
    });

    it('should not queue a sent reminder when the task is restored', async () => {
      ownedBy(OWNER, true);
      tx.findById.mockResolvedValue({ ...SOON_TASK, reminderSentAt: NOW.toISOString() });

      await service.restore(OWNER, TASK.id);

      expect(reminders.schedule).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should pass the caller as assignee and the filters when only mine is asked', async () => {
      await service.list(MANAGER, {
        status: 'done',
        assignee: 'me',
        dealId: DEAL_REF.id,
        limit: 10,
      });

      expect(repository.list).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { status: 'done', assigneeId: MANAGER.id, clientId: undefined, dealId: DEAL_REF.id },
        { after: null, limit: 10 },
      );
    });

    it('should return a cursor after the last task when there are more', async () => {
      const done = { ...TASK, doneAt: '2026-10-13T08:00:00.000Z' };
      repository.list.mockResolvedValue({ items: [done], hasMore: true });

      const page = await service.list(OWNER, { status: 'done', limit: 1 });

      expect(page.nextCursor).toBe(
        encodeTaskCursor({ status: 'done', doneAt: done.doneAt, dueAt: done.dueAt, id: done.id }),
      );
    });

    it('should return no cursor when the page is the last', async () => {
      repository.list.mockResolvedValue({ items: [TASK], hasMore: false });

      expect((await service.list(OWNER, { status: 'open', limit: 1 })).nextCursor).toBeNull();
    });

    it('should throw RequestValidationError on cursor when it was made for the other status', async () => {
      const cursor = encodeTaskCursor({ status: 'open', dueAt: TASK.dueAt, id: TASK.id });

      await expect(
        service.list(OWNER, { status: 'done', cursor, limit: 25 }),
      ).rejects.toMatchObject({ fieldErrors: [{ path: 'cursor', message: 'Invalid cursor' }] });
      expect(repository.list).not.toHaveBeenCalled();
    });
  });
});
