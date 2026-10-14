import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { DashboardSummary } from '@clientry/shared/dashboard';

import { dashboardKeys } from './dashboard-keys';
import { fetchDashboardSummary } from '../api/dashboard-api';

export function useDashboardSummary(): UseQueryResult<DashboardSummary> {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: ({ signal }) => fetchDashboardSummary(signal),
  });
}
