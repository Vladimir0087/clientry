import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { deleteTask, taskKeys, TASKS_PATH } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';

import { useRestoreTask } from './use-restore-task';

const UNDO_DURATION_MS = 10_000;

export function useDeleteTask(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const router = useRouter();
  const restore = useRestoreTask();

  // The route goes first: the task page is still mounted, and refetching its task would get a 404.
  // The detail is only marked stale, so a later visit refetches and shows not found.
  const leaveTask = (id: string): void => {
    requestHeadingFocus();
    router.replace(TASKS_PATH);
    void queryClient.invalidateQueries({ queryKey: taskKeys.lists });
    void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id), refetchType: 'none' });
  };

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: (_result, id) => {
      leaveTask(id);
      toast('Task deleted', {
        duration: UNDO_DURATION_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            restore.mutate(id);
          },
        },
      });
    },
    onError: (error, id) => {
      if (isNotFound(error)) {
        leaveTask(id);
        toast('This task was already deleted.');
      }
    },
  });
}
