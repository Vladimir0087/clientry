import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { MemberListResponse } from '@clientry/shared/workspaces';

import { memberKeys } from './member-keys';
import { fetchMembers } from '../api/member-api';

interface UseMembersOptions {
  // False keeps the request back; data already in the cache is still returned.
  readonly enabled?: boolean;
}

export function useMembers({
  enabled = true,
}: UseMembersOptions = {}): UseQueryResult<MemberListResponse> {
  return useQuery({
    queryKey: memberKeys.list,
    queryFn: ({ signal }) => fetchMembers(signal),
    enabled,
  });
}
