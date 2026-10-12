import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

import { clientKeys } from '@/entities/client';
import { dealKeys } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { createTask, taskKeys, updateTask } from '@/entities/task';
import { ApiError } from '@/shared/api/api-error';
import type { CreateTaskRequest, Task, UpdateTaskRequest } from '@clientry/shared/tasks';

interface UpdateVariables {
  readonly id: string;
  readonly changes: UpdateTaskRequest;
}

// The task page opens from the cache; every list refetches when shown next.
function storeSavedTask(queryClient: QueryClient, task: Task): void {
  queryClient.setQueryData(taskKeys.detail(task.id), task);
  void queryClient.invalidateQueries({ queryKey: taskKeys.lists });
}

// A refused assignee, client or deal was removed or deleted elsewhere: its list loads again
// without it.
function refreshRefusedOptions(queryClient: QueryClient, error: Error): void {
  const paths = error instanceof ApiError ? error.errors.map(({ path }) => path) : [];
  if (paths.includes('assigneeId')) {
    void queryClient.invalidateQueries({ queryKey: memberKeys.all });
  }
  if (paths.includes('related.id')) {
    void queryClient.invalidateQueries({ queryKey: clientKeys.lists });
    void queryClient.invalidateQueries({ queryKey: dealKeys.clientLists });
  }
}

export function useCreateTask(): UseMutationResult<Task, Error, CreateTaskRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskRequest) => createTask(input),
    onSuccess: (task) => {
      storeSavedTask(queryClient, task);
    },
    onError: (error) => {
      refreshRefusedOptions(queryClient, error);
    },
  });
}

export function useUpdateTask(): UseMutationResult<Task, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: UpdateVariables) => updateTask(id, changes),
    onSuccess: (task) => {
      storeSavedTask(queryClient, task);
    },
    onError: (error) => {
      refreshRefusedOptions(queryClient, error);
    },
  });
}
