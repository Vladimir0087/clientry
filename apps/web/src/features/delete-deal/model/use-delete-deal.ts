import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { dealKeys, DEALS_PATH, deleteDeal, stageKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import type { Deal } from '@clientry/shared/deals';

import { useRestoreDeal } from './use-restore-deal';

const UNDO_DURATION_MS = 10_000;

type DeletedDeal = Pick<Deal, 'id'>;

export function useDeleteDeal(): UseMutationResult<void, Error, DeletedDeal> {
  const queryClient = useQueryClient();
  const router = useRouter();
  const restore = useRestoreDeal();

  // The route goes first: the deal page is still mounted, and refetching its deal would get a 404.
  // The detail is only marked stale, so a later visit refetches and shows not found.
  const leaveDeal = ({ id }: DeletedDeal): void => {
    requestHeadingFocus();
    router.replace(DEALS_PATH);
    void queryClient.invalidateQueries({ queryKey: dealKeys.boards });
    // Only marked stale: a refetch for the leaving stage select would be aborted with it.
    void queryClient.invalidateQueries({ queryKey: stageKeys.all, refetchType: 'none' });
    // Every client's list: the page's deal may name a client it has since been moved from.
    void queryClient.invalidateQueries({ queryKey: dealKeys.clientLists });
    void queryClient.invalidateQueries({ queryKey: dealKeys.detail(id), refetchType: 'none' });
    // The deal's tasks are hidden with it; only marked stale, as the page is leaving.
    void queryClient.invalidateQueries({ queryKey: taskKeys.all, refetchType: 'none' });
  };

  return useMutation({
    mutationFn: ({ id }: DeletedDeal) => deleteDeal(id),
    onSuccess: (_result, deal) => {
      leaveDeal(deal);
      toast('Deal deleted', {
        duration: UNDO_DURATION_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            restore.mutate(deal.id);
          },
        },
      });
    },
    onError: (error, deal) => {
      if (isNotFound(error)) {
        leaveDeal(deal);
        toast('This deal was already deleted.');
      }
    },
  });
}
