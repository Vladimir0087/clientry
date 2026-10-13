import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { sessionKeys } from '@/entities/session';
import { apiRequest } from '@/shared/api/browser-client';
import type { SessionResponse } from '@clientry/shared/auth';
import { workspaceResponseSchema } from '@clientry/shared/workspaces';
import type { WorkspaceResponse } from '@clientry/shared/workspaces';

export function useRenameWorkspace(): UseMutationResult<WorkspaceResponse, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest('/api/workspace', workspaceResponseSchema, { method: 'PATCH', body: { name } }),
    // The header reads the session, so it shows the new name without a refetch. A refetch already
    // in flight may carry the old name, so it is cancelled, and sent again after the write: it may
    // have been asked for a role change.
    onSuccess: async (workspace) => {
      const hasRefetchInFlight = queryClient.isFetching({ queryKey: sessionKeys.current }) > 0;
      await queryClient.cancelQueries({ queryKey: sessionKeys.current });
      queryClient.setQueryData<SessionResponse>(sessionKeys.current, (session) =>
        session === undefined ? session : { ...session, workspace },
      );
      if (hasRefetchInFlight) {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.current });
      }
    },
  });
}
