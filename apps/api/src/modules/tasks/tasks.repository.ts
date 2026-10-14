import type { ActivityEvent } from '@clientry/shared/activity';
import type { Task, TaskRef, TaskRelatedRequest, TaskStatus } from '@clientry/shared/tasks';

import type { TaskCursor } from './task-cursor.js';

// Instants are ISO strings in the stored toISOString() form.
export interface NewTask {
  readonly title: string;
  readonly dueAt: string;
  readonly remindAt: string | null;
  readonly assigneeId: string;
  readonly related: TaskRelatedRequest | null;
}

// A field left undefined is not changed.
export interface TaskWrite extends Partial<NewTask> {
  readonly reminderSentAt?: null;
  readonly doneAt?: string | null;
}

export interface TaskOwnership {
  readonly createdById: string;
  readonly isDeleted: boolean;
  // Its client, its deal or that deal's client is deleted.
  readonly isHidden: boolean;
}

export interface TaskListFilter {
  readonly status: TaskStatus;
  readonly assigneeId?: string;
  readonly clientId?: string;
  readonly dealId?: string;
}

export interface TaskPageRequest {
  readonly after: TaskCursor | null;
  readonly limit: number;
}

export type TaskEvent = Extract<ActivityEvent, { type: 'task_created' | 'task_completed' }>;

export interface TaskPage {
  readonly items: readonly Task[];
  readonly hasMore: boolean;
}

// A task is visible when neither it nor anything it links to is deleted: its client, or its deal
// and that deal's client. Every read returns only visible tasks, except findOwnership.
export interface TasksTransaction {
  // Locks the task row until the transaction ends.
  findById(workspaceId: string, id: string): Promise<Task | null>;
  // The reference checks read FOR SHARE: a delete of the row waits for the task or is seen.
  findMember(workspaceId: string, userId: string): Promise<TaskRef | null>;
  findClient(workspaceId: string, clientId: string): Promise<TaskRef | null>;
  findDeal(workspaceId: string, dealId: string): Promise<TaskRef | null>;
  create(workspaceId: string, createdById: string, task: NewTask): Promise<Task>;
  // Null when no visible task matched.
  update(workspaceId: string, id: string, write: TaskWrite): Promise<Task | null>;
  findOwnership(workspaceId: string, id: string): Promise<TaskOwnership | null>;
  // False when no visible active task matched.
  softDelete(workspaceId: string, id: string): Promise<boolean>;
  // False when the task was not deleted or is hidden.
  restore(workspaceId: string, id: string): Promise<boolean>;
  addActivity(
    workspaceId: string,
    taskId: string,
    actorId: string,
    event: TaskEvent,
  ): Promise<void>;
}

export abstract class TasksRepository {
  abstract findById(workspaceId: string, id: string): Promise<Task | null>;
  abstract list(
    workspaceId: string,
    filter: TaskListFilter,
    page: TaskPageRequest,
  ): Promise<TaskPage>;
  abstract inTransaction<T>(work: (tasks: TasksTransaction) => Promise<T>): Promise<T>;
}
