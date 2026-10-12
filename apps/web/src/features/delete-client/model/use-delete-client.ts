import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { clientKeys, CLIENTS_PATH, deleteClient } from '@/entities/client';
import { dealKeys, stageKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';

import { useRestoreClient } from './use-restore-client';

const UNDO_DURATION_MS = 10_000;

export function useDeleteClient(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const router = useRouter();
  const restore = useRestoreClient();

  // The route goes first: the card is still mounted, and refetching its client would get a 404.
  // The detail is only marked stale, so a later visit refetches and shows not found.
  const leaveClient = (id: string): void => {
    requestHeadingFocus();
    router.replace(CLIENTS_PATH);
    void queryClient.invalidateQueries({ queryKey: clientKeys.lists });
    void queryClient.invalidateQueries({ queryKey: clientKeys.tags });
    void queryClient.invalidateQueries({ queryKey: clientKeys.detail(id), refetchType: 'none' });
    // The client's deals and tasks are hidden with it, and the stages count only visible deals.
    // Only marked stale too: the card would refetch its deals, now none, behind the leaving dialog.
    void queryClient.invalidateQueries({ queryKey: dealKeys.all, refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: stageKeys.all, refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: taskKeys.all, refetchType: 'none' });
  };

  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: (_result, id) => {
      leaveClient(id);
      toast('Client deleted', {
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
        leaveClient(id);
        toast('This client was already deleted.');
      }
    },
  });
}
