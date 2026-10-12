import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Deal } from '@clientry/shared/deals';

import { dealKeys } from './deal-keys';
import { fetchDeal } from '../api/deal-api';

export function useDeal(id: string): UseQueryResult<Deal> {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn: ({ signal }) => fetchDeal(id, signal),
  });
}
