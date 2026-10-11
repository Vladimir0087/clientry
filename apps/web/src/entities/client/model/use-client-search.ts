import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { ClientListResponse } from '@clientry/shared/clients';

import { clientKeys } from './client-keys';
import { fetchClientSearch } from '../api/client-api';

export function useClientSearch(q: string): UseQueryResult<ClientListResponse> {
  return useQuery({
    queryKey: clientKeys.search(q),
    queryFn: ({ signal }) => fetchClientSearch(q, signal),
    placeholderData: keepPreviousData,
  });
}
