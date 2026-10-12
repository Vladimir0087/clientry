import type { QueryClient } from '@tanstack/react-query';

import type { Task } from '@clientry/shared/tasks';

import { taskKeys } from './task-keys';
import type { TaskListData } from './use-tasks';

function hasTask(data: TaskListData, id: string): boolean {
  return data.pages.some((page) => page.items.some((task) => task.id === id));
}

// Every cached list and the detail, in place: rows keep their positions until a list refetches.
// A write marks a list fresh, so lists without the task are skipped.
export function updateCachedTask(
  queryClient: QueryClient,
  id: string,
  update: (task: Task) => Task,
): void {
  queryClient.setQueriesData<TaskListData>({ queryKey: taskKeys.lists }, (data) =>
    data === undefined || !hasTask(data, id)
      ? undefined
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((task) => (task.id === id ? update(task) : task)),
          })),
        },
  );
  queryClient.setQueryData<Task>(taskKeys.detail(id), (task) =>
    task === undefined ? task : update(task),
  );
}
