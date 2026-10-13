import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { createInvite, inviteKeys, revokeInvite } from '@/entities/invite';
import type { CreatedInviteResponse } from '@clientry/shared/workspaces';

export function useCreateInvite(): UseMutationResult<CreatedInviteResponse, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createInvite(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
    },
  });
}

export function useRevokeInvite(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
    },
  });
}
