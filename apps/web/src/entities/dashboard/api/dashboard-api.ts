import type { ApiPath } from '@/shared/api/api-path';
import { apiRequest } from '@/shared/api/browser-client';
import {
  closedDealsResponseSchema,
  dashboardSummaryResponseSchema,
} from '@clientry/shared/dashboard';
import type { ClosedDeals, DashboardSummary } from '@clientry/shared/dashboard';

export const DASHBOARD_SUMMARY_PATH = '/api/dashboard/summary';

export function closedDealsPath(bounds: readonly string[]): ApiPath {
  const query = new URLSearchParams(bounds.map((bound) => ['bounds', bound]));
  return `/api/dashboard/closed-deals?${query.toString()}`;
}

export function fetchDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  return apiRequest(DASHBOARD_SUMMARY_PATH, dashboardSummaryResponseSchema, { signal });
}

export function fetchClosedDeals(
  bounds: readonly string[],
  signal?: AbortSignal,
): Promise<ClosedDeals> {
  return apiRequest(closedDealsPath(bounds), closedDealsResponseSchema, { signal });
}
