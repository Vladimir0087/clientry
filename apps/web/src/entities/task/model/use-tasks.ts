import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import type { TaskListResponse } from '@clientry/shared/tasks';

import type { TaskFilters } from './task-filters';
import { taskKeys } from './task-keys';
import { fetchTasks } from '../api/task-api';

export type TaskListData = InfiniteData<TaskListResponse, string | null>;

// The old rows stay on screen while the list for new filters loads.
export function useTasks(filters: TaskFilters): UseInfiniteQueryResult<TaskListData> {
  return useInfiniteQuery({
    queryKey: taskKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchTasks(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  });
}
