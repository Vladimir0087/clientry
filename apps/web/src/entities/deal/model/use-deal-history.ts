import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { DealHistoryResponse } from '@clientry/shared/deals';

import { dealKeys } from './deal-keys';
import { fetchDealHistory } from '../api/deal-api';

export function useDealHistory(id: string): UseQueryResult<DealHistoryResponse> {
  return useQuery({
    queryKey: dealKeys.history(id),
    queryFn: ({ signal }) => fetchDealHistory(id, signal),
  });
}
