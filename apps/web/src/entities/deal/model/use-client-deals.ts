import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { DealListResponse } from '@clientry/shared/deals';

import { dealKeys } from './deal-keys';
import { fetchClientDeals } from '../api/deal-api';

export function useClientDeals(clientId: string): UseQueryResult<DealListResponse> {
  return useQuery({
    queryKey: dealKeys.byClient(clientId),
    queryFn: ({ signal }) => fetchClientDeals(clientId, signal),
  });
}
