import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { MemberListResponse } from '@clientry/shared/workspaces';

import { memberKeys } from './member-keys';
import { fetchMembers } from '../api/member-api';

export function useMembers(): UseQueryResult<MemberListResponse> {
  return useQuery({
    queryKey: memberKeys.list,
    queryFn: ({ signal }) => fetchMembers(signal),
  });
}
