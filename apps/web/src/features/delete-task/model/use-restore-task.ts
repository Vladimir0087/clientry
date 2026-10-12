import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { restoreTask, taskKeys } from '@/entities/task';
import type { Task } from '@clientry/shared/tasks';

// Undo runs after the task page has unmounted, and TanStack drops mutate() callbacks of an
// unmounted component; handlers in these options always run.
export function useRestoreTask(): UseMutationResult<Task, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onSuccess: (task) => {
      toast.success('Task restored');
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
    },
    onError: () => {
      toast.error('Could not restore the task.');
    },
  });
}
