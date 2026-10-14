import {
  closedDealsResponseSchema,
  dashboardSummaryResponseSchema,
} from '@clientry/shared/dashboard';
import type { ClosedDeals, ClosedDealsPeriod, DashboardSummary } from '@clientry/shared/dashboard';

import { CALL_STAGE, NEW_STAGE, PROPOSAL_STAGE } from './deals';
import { TEST_SESSION } from './fixtures';

const NONE = { count: 0, totals: [] };

export const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };

// Two members with work in two currencies, an empty stage and overdue tasks.
export function makeSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return dashboardSummaryResponseSchema.parse({
    openDeals: {
      count: 14,
      totals: [
        { currency: 'USD', amount: 4_550_000, count: 12 },
        { currency: 'EUR', amount: 120_000, count: 2 },
      ],
    },
    stages: [
      {
        stage: NEW_STAGE,
        count: 9,
        totals: [{ currency: 'USD', amount: 900_000, count: 9 }],
      },
      { stage: CALL_STAGE, count: 0, totals: [] },
      {
        stage: PROPOSAL_STAGE,
        count: 5,
        totals: [
          { currency: 'USD', amount: 3_650_000, count: 3 },
          { currency: 'EUR', amount: 120_000, count: 2 },
        ],
      },
    ],
    tasks: { open: 23, overdue: 4 },
    members: [
      {
        member: { id: TEST_SESSION.user.id, name: TEST_SESSION.user.name },
        openDeals: { count: 6, totals: [{ currency: 'USD', amount: 2_100_000, count: 6 }] },
        openTasks: 9,
        overdueTasks: 1,
      },
      { member: { id: MAX.id, name: MAX.name }, openDeals: NONE, openTasks: 0, overdueTasks: 0 },
    ],
    ...overrides,
  });
}

export const EMPTY_SUMMARY: DashboardSummary = makeSummary({
  openDeals: NONE,
  stages: [{ stage: NEW_STAGE, ...NONE }],
  tasks: { open: 0, overdue: 0 },
  members: [],
});

// Six UTC month starts of 2026, May to October, and the start of November.
export const TEST_BOUNDS = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.UTC(2026, 4 + index, 1)).toISOString(),
);

type PeriodFill = Partial<Pick<ClosedDealsPeriod, 'won' | 'lost'>>;

// One fill per period, oldest first; periods without one closed nothing.
export function makeClosedDeals(fills: readonly PeriodFill[] = []): ClosedDeals {
  return closedDealsResponseSchema.parse({
    periods: TEST_BOUNDS.slice(1).map((end, index) => ({
      start: TEST_BOUNDS[index],
      end,
      won: fills[index]?.won ?? NONE,
      lost: fills[index]?.lost ?? NONE,
    })),
  });
}
