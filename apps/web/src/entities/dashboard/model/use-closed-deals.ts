import { skipToken, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { ClosedDeals } from '@clientry/shared/dashboard';

import { dashboardKeys } from './dashboard-keys';
import { fetchClosedDeals } from '../api/dashboard-api';

// Waits for the bounds, which only the browser can build.
export function useClosedDeals(bounds: readonly string[] | null): UseQueryResult<ClosedDeals> {
  return useQuery({
    queryKey: dashboardKeys.closedDeals(bounds ?? []),
    queryFn: bounds === null ? skipToken : ({ signal }) => fetchClosedDeals(bounds, signal),
  });
}
