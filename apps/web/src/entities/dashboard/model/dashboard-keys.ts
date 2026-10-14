export const dashboardKeys = {
  all: ['dashboard'],
  summary: ['dashboard', 'summary'],
  closedDeals: (bounds: readonly string[]) => ['dashboard', 'closed-deals', bounds] as const,
} as const;
