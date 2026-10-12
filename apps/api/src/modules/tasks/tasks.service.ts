import { Injectable, Logger } from '@nestjs/common';

import { canDeleteRecord } from '@clientry/shared/auth';
import type { FieldError } from '@clientry/shared/common';
import type {
  CreateTaskRequest,
  Task,
  TaskListQuery,
  TaskListResponse,
  TaskRelatedRequest,
  UpdateTaskRequest,
} from '@clientry/shared/tasks';

import { TaskDeleteForbiddenError, TaskNotFoundError } from './errors.js';
import { ReminderQueue } from './reminder-queue.js';
import { isPending } from './reminder-window.js';
import { changedFields, hasChanges } from './task-changes.js';
import { decodeTaskCursor, encodeTaskCursor } from './task-cursor.js';
import type { TaskCursor } from './task-cursor.js';
import { referenceErrors } from './task-references.js';
import type { ReferenceLookups } from './task-references.js';
import { TasksRepository } from './tasks.repository.js';
import type { TaskListFilter, TasksTransaction, TaskWrite } from './tasks.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

interface CheckedFields {
  readonly remindAt?: string | null;
  readonly assigneeId?: string;
  readonly related?: TaskRelatedRequest | null;
}

// Only a reminder set or changed now must lie ahead; an unchanged past one stays as it is.
function reminderErrors(remindAt: string | null | undefined): FieldError[] {
  return typeof remindAt === 'string' && Date.parse(remindAt) <= Date.now()
    ? [{ path: 'remindAt', message: 'Choose a time in the future' }]
    : [];
}

function toFilter(user: AuthUser, query: TaskListQuery): TaskListFilter {
  return {
    status: query.status,
    assigneeId: query.assignee === 'me' ? user.id : undefined,
    clientId: query.clientId,
    dealId: query.dealId,
  };
}

function cursorAfter(task: Task): TaskCursor {
  return task.doneAt === null
    ? { status: 'open', dueAt: task.dueAt, id: task.id }
    : { status: 'done', doneAt: task.doneAt, dueAt: task.dueAt, id: task.id };
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasks: TasksRepository,
    private readonly reminders: ReminderQueue,
  ) {}

  async get(user: AuthUser, id: string): Promise<Task> {
    const task = await this.tasks.findById(user.workspaceId, id);
    if (!task) {
      throw new TaskNotFoundError();
    }
    return task;
  }

  async list(user: AuthUser, query: TaskListQuery): Promise<TaskListResponse> {
    const after = this.decodeCursor(query);
    const page = await this.tasks.list(user.workspaceId, toFilter(user, query), {
      after,
      limit: query.limit,
    });
    const last = page.items.at(-1);
    const nextCursor = page.hasMore && last ? encodeTaskCursor(cursorAfter(last)) : null;
    return { items: [...page.items], nextCursor };
  }

  async create(user: AuthUser, input: CreateTaskRequest): Promise<Task> {
    const { workspaceId } = user;
    const task = await this.tasks.inTransaction(async (tasks) => {
      await this.checkFields(tasks, workspaceId, input);
      return tasks.create(workspaceId, user.id, {
        title: input.title,
        dueAt: input.dueAt,
        remindAt: input.remindAt ?? null,
        assigneeId: input.assigneeId,
        related: input.related ?? null,
      });
    });
    this.logger.log(this.logContext(user, task.id), 'Task created');
    await this.scheduleReminder(workspaceId, task);
    return task;
  }

  // Sent values equal to the stored ones are dropped; nothing left reads the task unchanged.
  async update(user: AuthUser, id: string, input: UpdateTaskRequest): Promise<Task> {
    const { workspaceId } = user;
    const { task, isChanged } = await this.tasks.inTransaction(async (tasks) => {
      const current = await tasks.findById(workspaceId, id);
      if (!current) {
        throw new TaskNotFoundError();
      }
      const edit = changedFields(current, input);
      if (!hasChanges(edit)) {
        return { task: current, isChanged: false };
      }
      await this.checkFields(tasks, workspaceId, edit);
      // A new reminder time re-arms the reminder.
      const write: TaskWrite =
        edit.remindAt === undefined ? edit : { ...edit, reminderSentAt: null };
      return { task: await this.write(tasks, workspaceId, id, write), isChanged: true };
    });
    if (isChanged) {
      await this.scheduleReminder(workspaceId, task);
    }
    return task;
  }

  // Idempotent: a done task keeps its doneAt.
  async complete(user: AuthUser, id: string): Promise<Task> {
    return this.setDone(user, id, true);
  }

  async reopen(user: AuthUser, id: string): Promise<Task> {
    return this.setDone(user, id, false);
  }

  async delete(user: AuthUser, id: string): Promise<void> {
    const { workspaceId } = user;
    await this.tasks.inTransaction(async (tasks) => {
      const ownership = await tasks.findOwnership(workspaceId, id);
      if (!ownership || ownership.isDeleted || ownership.isHidden) {
        throw new TaskNotFoundError();
      }
      this.assertCanDelete(user, ownership.createdById);
      if (!(await tasks.softDelete(workspaceId, id))) {
        throw new TaskNotFoundError();
      }
    });
    this.logger.log(this.logContext(user, id), 'Task deleted');
  }

  // Restoring an active task returns it unchanged, so a repeated undo is harmless.
  async restore(user: AuthUser, id: string): Promise<Task> {
    const { workspaceId } = user;
    const { task, isRestored } = await this.tasks.inTransaction(async (tasks) => {
      const ownership = await tasks.findOwnership(workspaceId, id);
      if (!ownership || ownership.isHidden) {
        throw new TaskNotFoundError();
      }
      this.assertCanDelete(user, ownership.createdById);
      const hasRestored = ownership.isDeleted && (await tasks.restore(workspaceId, id));
      const restored = await tasks.findById(workspaceId, id);
      if (!restored) {
        throw new TaskNotFoundError();
      }
      return { task: restored, isRestored: hasRestored };
    });
    if (isRestored) {
      this.logger.log(this.logContext(user, id), 'Task restored');
      await this.scheduleReminder(workspaceId, task);
    }
    return task;
  }

  private async setDone(user: AuthUser, id: string, isDone: boolean): Promise<Task> {
    const { workspaceId } = user;
    const { task, isChanged } = await this.tasks.inTransaction(async (tasks) => {
      const current = await tasks.findById(workspaceId, id);
      if (!current) {
        throw new TaskNotFoundError();
      }
      if ((current.doneAt !== null) === isDone) {
        return { task: current, isChanged: false };
      }
      const doneAt = isDone ? new Date().toISOString() : null;
      return { task: await this.write(tasks, workspaceId, id, { doneAt }), isChanged: true };
    });
    if (isChanged) {
      this.logger.log(this.logContext(user, id), isDone ? 'Task completed' : 'Task reopened');
      await this.scheduleReminder(workspaceId, task);
    }
    return task;
  }

  // After the commit, so the job never runs before the task it reads. A failed add leaves the
  // reminder to the sweep instead of failing a write that already succeeded.
  private async scheduleReminder(workspaceId: string, task: Task): Promise<void> {
    if (task.remindAt === null || !isPending(task, new Date())) {
      return;
    }
    try {
      await this.reminders.schedule([{ workspaceId, taskId: task.id, remindAt: task.remindAt }]);
    } catch (error) {
      this.logger.warn({ err: error, taskId: task.id, workspaceId }, 'Could not queue a reminder');
    }
  }

  private async write(
    tasks: TasksTransaction,
    workspaceId: string,
    id: string,
    write: TaskWrite,
  ): Promise<Task> {
    const task = await tasks.update(workspaceId, id, write);
    if (!task) {
      throw new TaskNotFoundError();
    }
    return task;
  }

  // One 400 names every invalid field. One connection serves the transaction, so the lookups run
  // one after another.
  private async checkFields(
    tasks: TasksTransaction,
    workspaceId: string,
    { remindAt, assigneeId, related }: CheckedFields,
  ): Promise<void> {
    const assignee =
      assigneeId === undefined ? undefined : await tasks.findMember(workspaceId, assigneeId);
    const errors = [
      ...reminderErrors(remindAt),
      ...referenceErrors({
        assignee,
        related: await this.lookUpRelated(tasks, workspaceId, related),
      }),
    ];
    if (errors.length > 0) {
      throw new RequestValidationError(errors);
    }
  }

  private async lookUpRelated(
    tasks: TasksTransaction,
    workspaceId: string,
    related: TaskRelatedRequest | null | undefined,
  ): Promise<ReferenceLookups['related']> {
    if (!related) {
      return undefined;
    }
    const found =
      related.kind === 'client'
        ? await tasks.findClient(workspaceId, related.id)
        : await tasks.findDeal(workspaceId, related.id);
    return { kind: related.kind, found };
  }

  private decodeCursor(query: TaskListQuery): TaskCursor | null {
    if (query.cursor === undefined) {
      return null;
    }
    const cursor = decodeTaskCursor(query.cursor, query.status);
    if (!cursor) {
      throw new RequestValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
    }
    return cursor;
  }

  private assertCanDelete(user: AuthUser, createdById: string): void {
    if (!canDeleteRecord({ userId: user.id, role: user.role }, createdById)) {
      throw new TaskDeleteForbiddenError();
    }
  }

  private logContext(user: AuthUser, taskId: string): Record<string, string> {
    return { taskId, workspaceId: user.workspaceId, userId: user.id };
  }
}
