import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { dealKeys, restoreDeal, stageKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import type { Deal } from '@clientry/shared/deals';

// Undo runs after the deal page has unmounted, and TanStack drops mutate() callbacks of an
// unmounted component; handlers in these options always run.
export function useRestoreDeal(): UseMutationResult<Deal, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreDeal(id),
    onSuccess: (deal) => {
      toast.success('Deal restored');
      void queryClient.invalidateQueries({ queryKey: dealKeys.boards });
      void queryClient.invalidateQueries({ queryKey: stageKeys.all });
      void queryClient.invalidateQueries({ queryKey: dealKeys.byClient(deal.client.id) });
      void queryClient.invalidateQueries({ queryKey: dealKeys.detail(deal.id) });
      void queryClient.invalidateQueries({ queryKey: dealKeys.history(deal.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onError: () => {
      toast.error('Could not restore the deal.');
    },
  });
}
