import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

import {
  createStage,
  dealKeys,
  deleteStage,
  renameStage,
  reorderStages,
  stageKeys,
} from '@/entities/deal';
import type { Stage, StageListResponse } from '@clientry/shared/deals';

interface RenameVariables {
  readonly id: string;
  readonly name: string;
}

interface DeleteVariables {
  readonly id: string;
  readonly moveDealsTo: string;
}

// Deal queries follow: the board shows the stages as columns, a delete moves deals (new versions,
// history entries) and a rename changes the stage names deals show.
function refreshStages(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: stageKeys.all });
  void queryClient.invalidateQueries({ queryKey: dealKeys.all });
}

export function useAddStage(): UseMutationResult<Stage, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createStage(name),
    onSuccess: () => {
      refreshStages(queryClient);
    },
  });
}

export function useRenameStage(): UseMutationResult<Stage, Error, RenameVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: RenameVariables) => renameStage(id, name),
    // The row shows the new name at once instead of the old one until the refetch.
    onSuccess: (renamed) => {
      queryClient.setQueryData<StageListResponse>(stageKeys.list, (list) =>
        list === undefined
          ? list
          : {
              items: list.items.map((stage) =>
                stage.id === renamed.id ? { ...stage, name: renamed.name } : stage,
              ),
            },
      );
      refreshStages(queryClient);
    },
  });
}

export function useReorderStages(): UseMutationResult<StageListResponse, Error, readonly string[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) => reorderStages(ids),
    onSuccess: (stages) => {
      queryClient.setQueryData(stageKeys.list, stages);
      void queryClient.invalidateQueries({ queryKey: dealKeys.boards });
    },
  });
}

export function useDeleteStage(): UseMutationResult<void, Error, DeleteVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveDealsTo }: DeleteVariables) => deleteStage(id, moveDealsTo),
    onSuccess: () => {
      refreshStages(queryClient);
    },
  });
}
