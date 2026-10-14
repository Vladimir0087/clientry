import type { QueryClient } from '@tanstack/react-query';

import { activityKeys } from '@/entities/activity';
import { dashboardKeys } from '@/entities/dashboard';

// Any write can change the dashboard, so every successful mutation invalidates it, and a feature
// added later cannot forget to. An open dashboard refetches now; a closed one on the next visit.
export function markDashboardStale(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  void queryClient.invalidateQueries({ queryKey: activityKeys.all });
}
