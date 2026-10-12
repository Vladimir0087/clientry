import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import { taskListResponseSchema, taskSchema } from '@clientry/shared/tasks';
import type {
  CreateTaskRequest,
  Task,
  TaskListResponse,
  UpdateTaskRequest,
} from '@clientry/shared/tasks';

import { taskListPath } from './task-list-path';
import type { TaskFilters } from '../model/task-filters';

export function fetchTasks(
  filters: TaskFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TaskListResponse> {
  return apiRequest(taskListPath(filters, cursor), taskListResponseSchema, { signal });
}

export function fetchTask(id: string, signal?: AbortSignal): Promise<Task> {
  return apiRequest(`/api/tasks/${id}`, taskSchema, { signal });
}

export function createTask(input: CreateTaskRequest): Promise<Task> {
  return apiRequest('/api/tasks', taskSchema, { method: 'POST', body: input });
}

export function updateTask(id: string, changes: UpdateTaskRequest): Promise<Task> {
  return apiRequest(`/api/tasks/${id}`, taskSchema, { method: 'PATCH', body: changes });
}

export function completeTask(id: string): Promise<Task> {
  return apiRequest(`/api/tasks/${id}/complete`, taskSchema, { method: 'POST' });
}

export function reopenTask(id: string): Promise<Task> {
  return apiRequest(`/api/tasks/${id}/reopen`, taskSchema, { method: 'POST' });
}

export function deleteTask(id: string): Promise<void> {
  return apiRequest(`/api/tasks/${id}`, z.undefined(), { method: 'DELETE' });
}

export function restoreTask(id: string): Promise<Task> {
  return apiRequest(`/api/tasks/${id}/restore`, taskSchema, { method: 'POST' });
}
