import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Task } from '@clientry/shared/tasks';

import { taskKeys } from './task-keys';
import { fetchTask } from '../api/task-api';

export function useTask(id: string): UseQueryResult<Task> {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) => fetchTask(id, signal),
  });
}
