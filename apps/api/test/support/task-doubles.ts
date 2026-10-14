import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { Task } from '@clientry/shared/tasks';

import type { AuthUser } from '../../src/common/auth/auth-user.js';
import type { ReminderQueue } from '../../src/modules/tasks/reminder-queue.js';
import type {
  TasksRepository,
  TasksTransaction,
} from '../../src/modules/tasks/tasks.repository.js';

export const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

export const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: WORKSPACE_ID,
  role: 'owner',
};

export const MANAGER: AuthUser = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  workspaceId: WORKSPACE_ID,
  role: 'manager',
};

export const CLIENT_REF = { id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b', name: 'Romashka LLC' };

export const DEAL_REF = { id: '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b', name: 'Landing page' };

export const TASK: Task = {
  id: '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a',
  title: 'Call Romashka about the proposal',
  dueAt: '2026-10-15T12:00:00.000Z',
  remindAt: '2026-10-15T06:00:00.000Z',
  reminderSentAt: null,
  doneAt: null,
  assignee: { id: OWNER.id, name: 'Ann' },
  createdBy: { id: OWNER.id, name: 'Ann' },
  related: { kind: 'client', ...CLIENT_REF },
  createdAt: '2026-10-11T09:30:00.000Z',
  updatedAt: '2026-10-11T09:30:00.000Z',
};

export type TaskTransactionMock = {
  readonly [K in keyof TasksTransaction]: Mock<TasksTransaction[K]>;
};

type ReadMethod = Exclude<keyof TasksRepository, 'inTransaction'>;

export type TaskRepositoryMock = { readonly [K in ReadMethod]: Mock<TasksRepository[K]> } & {
  readonly inTransaction: TasksRepository['inTransaction'];
};

// Every lookup succeeds by default; a test overrides the one it is about.
export function createTaskTransactionMock(): TaskTransactionMock {
  return {
    findById: vi.fn<TasksTransaction['findById']>().mockResolvedValue(TASK),
    findMember: vi
      .fn<TasksTransaction['findMember']>()
      .mockResolvedValue({ id: OWNER.id, name: 'Ann' }),
    findClient: vi.fn<TasksTransaction['findClient']>().mockResolvedValue(CLIENT_REF),
    findDeal: vi.fn<TasksTransaction['findDeal']>().mockResolvedValue(DEAL_REF),
    create: vi.fn<TasksTransaction['create']>().mockResolvedValue(TASK),
    update: vi.fn<TasksTransaction['update']>().mockResolvedValue(TASK),
    findOwnership: vi.fn<TasksTransaction['findOwnership']>().mockResolvedValue({
      createdById: OWNER.id,
      isDeleted: false,
      isHidden: false,
    }),
    softDelete: vi.fn<TasksTransaction['softDelete']>().mockResolvedValue(true),
    restore: vi.fn<TasksTransaction['restore']>().mockResolvedValue(true),
    addActivity: vi.fn<TasksTransaction['addActivity']>().mockResolvedValue(undefined),
  };
}

export function createTaskRepositoryMock(tx: TasksTransaction): TaskRepositoryMock {
  return {
    findById: vi.fn<TasksRepository['findById']>().mockResolvedValue(TASK),
    list: vi.fn<TasksRepository['list']>().mockResolvedValue({ items: [], hasMore: false }),
    inTransaction: (work) => work(tx),
  };
}

export interface ReminderQueueMock extends ReminderQueue {
  readonly schedule: Mock<ReminderQueue['schedule']>;
}

export function createReminderQueueMock(): ReminderQueueMock {
  return { schedule: vi.fn<ReminderQueue['schedule']>().mockResolvedValue(undefined) };
}
