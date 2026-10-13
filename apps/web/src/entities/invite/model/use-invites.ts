import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { InviteListResponse } from '@clientry/shared/workspaces';

import { inviteKeys } from './invite-keys';
import { fetchInvites } from '../api/invite-api';

interface UseInvitesOptions {
  // Only owners may list invites, so the page asks only when the session grants it.
  readonly enabled: boolean;
}

export function useInvites({ enabled }: UseInvitesOptions): UseQueryResult<InviteListResponse> {
  return useQuery({
    queryKey: inviteKeys.list,
    queryFn: ({ signal }) => fetchInvites(signal),
    enabled,
  });
}
