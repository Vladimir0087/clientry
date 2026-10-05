import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { SessionResponse } from '@clientry/shared/auth';

import { sessionKeys } from './session-keys';
import { fetchSession } from '../api/session-api';

export function useSession(): UseQueryResult<SessionResponse> {
  return useQuery({
    queryKey: sessionKeys.current,
    queryFn: ({ signal }) => fetchSession(signal),
  });
}
