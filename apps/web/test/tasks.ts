import { taskListResponseSchema, taskSchema } from '@clientry/shared/tasks';
import type { Task, TaskListResponse } from '@clientry/shared/tasks';

import { OTHER_USER, TEST_CLIENT } from './clients';
import { TEST_DEAL } from './deals';
import { TEST_SESSION } from './fixtures';

const ANN = { id: TEST_SESSION.user.id, name: TEST_SESSION.user.name };

function taskId(index: number): string {
  return `0199c2a1-1a2b-7c3d-8e4f-${String(index).padStart(12, '0')}`;
}

// Due far ahead, so it is never overdue unless a test says so.
export const TEST_TASK: Task = taskSchema.parse({
  id: taskId(1),
  title: 'Call Romashka about the proposal',
  dueAt: '2099-10-15T12:00:00.000Z',
  remindAt: '2099-10-15T11:00:00.000Z',
  reminderSentAt: null,
  doneAt: null,
  assignee: ANN,
  createdBy: ANN,
  related: {
    kind: 'deal',
    id: TEST_DEAL.id,
    title: TEST_DEAL.title,
    client: { id: TEST_CLIENT.id, name: TEST_CLIENT.name },
  },
  createdAt: '2026-10-11T09:30:00.000Z',
  updatedAt: '2026-10-11T09:30:00.000Z',
});

export const CLIENT_RELATED = {
  kind: 'client',
  id: TEST_CLIENT.id,
  name: TEST_CLIENT.name,
} as const;

export const OTHERS_TASK: Task = { ...TEST_TASK, createdBy: OTHER_USER, assignee: OTHER_USER };

export function makeTask(index: number, overrides: Partial<Task> = {}): Task {
  return { ...TEST_TASK, id: taskId(index), title: `Task ${String(index)}`, ...overrides };
}

export function makeTaskPage(
  tasks: readonly Task[],
  nextCursor: string | null = null,
): TaskListResponse {
  return taskListResponseSchema.parse({ items: tasks, nextCursor });
}
