import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import type { ClientListResponse } from '@clientry/shared/clients';

import type { ClientFilters } from './client-filters';
import { clientKeys } from './client-keys';
import { fetchClientList } from '../api/client-api';

export type ClientListData = InfiniteData<ClientListResponse, string | null>;

// The old rows stay on screen while the list for new filters loads.
export function useClientList(filters: ClientFilters): UseInfiniteQueryResult<ClientListData> {
  return useInfiniteQuery({
    queryKey: clientKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchClientList(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  });
}
