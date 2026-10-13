import type { ApiPath } from '@/shared/api/api-path';

import type { TaskFilters } from '../model/task-filters';

// Defaults are left out; the browser and the server prefetch build the URL here.
export function taskListPath(filters: TaskFilters, cursor: string | null): ApiPath {
  const params = new URLSearchParams();
  if (filters.status === 'done') {
    params.set('status', 'done');
  }
  if (filters.assignee !== null) {
    params.set('assignee', filters.assignee);
  }
  if (filters.clientId !== undefined) {
    params.set('clientId', filters.clientId);
  }
  if (filters.dealId !== undefined) {
    params.set('dealId', filters.dealId);
  }
  if (cursor !== null) {
    params.set('cursor', cursor);
  }
  const query = params.toString();
  return query === '' ? '/api/tasks' : `/api/tasks?${query}`;
}
