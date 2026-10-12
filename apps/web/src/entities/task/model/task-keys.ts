import type { TaskFilters } from './task-filters';

export const taskKeys = {
  all: ['tasks'],
  lists: ['tasks', 'list'],
  list: (filters: TaskFilters) => ['tasks', 'list', filters] as const,
  details: ['tasks', 'detail'],
  detail: (id: string) => ['tasks', 'detail', id] as const,
} as const;
