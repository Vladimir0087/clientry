import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

import { createDeal, dealKeys, stageKeys, updateDeal } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { ApiError } from '@/shared/api/api-error';
import type { CreateDealRequest, Deal, UpdateDealRequest } from '@clientry/shared/deals';

interface UpdateVariables {
  readonly id: string;
  readonly changes: UpdateDealRequest;
}

// A refused stage or assignee was deleted or removed elsewhere: its list loads again without it.
function refreshRefusedOptions(queryClient: QueryClient, error: Error): void {
  const paths = error instanceof ApiError ? error.errors.map(({ path }) => path) : [];
  if (paths.includes('stageId')) {
    void queryClient.invalidateQueries({ queryKey: stageKeys.all });
  }
  if (paths.includes('assigneeId')) {
    void queryClient.invalidateQueries({ queryKey: memberKeys.all });
  }
}

// The deal page opens from the cache; the board and lists refetch when shown next.
export function useCreateDeal(): UseMutationResult<Deal, Error, CreateDealRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDealRequest) => createDeal(input),
    onSuccess: (deal) => {
      queryClient.setQueryData(dealKeys.detail(deal.id), deal);
      void queryClient.invalidateQueries({ queryKey: dealKeys.boards });
      // Only marked stale: a refetch for the leaving form's stage select would be aborted with it.
      void queryClient.invalidateQueries({ queryKey: stageKeys.all, refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: dealKeys.byClient(deal.client.id) });
    },
    onError: (error) => {
      refreshRefusedOptions(queryClient, error);
    },
  });
}

// Every client's list: a changed client moves the deal from one list to another.
export function useUpdateDeal(): UseMutationResult<Deal, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: UpdateVariables) => updateDeal(id, changes),
    onSuccess: (deal) => {
      queryClient.setQueryData(dealKeys.detail(deal.id), deal);
      void queryClient.invalidateQueries({ queryKey: dealKeys.boards });
      void queryClient.invalidateQueries({ queryKey: dealKeys.history(deal.id) });
      void queryClient.invalidateQueries({ queryKey: dealKeys.clientLists });
    },
    onError: (error) => {
      refreshRefusedOptions(queryClient, error);
    },
  });
}
