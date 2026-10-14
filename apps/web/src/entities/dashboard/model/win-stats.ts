import type { ClosedDeals, DealTotals } from '@clientry/shared/dashboard';

export interface WinStats {
  readonly wonThisMonth: DealTotals;
  readonly won: number;
  readonly closed: number;
  // A whole percent; null when nothing closed.
  readonly rate: number | null;
}

const NONE: DealTotals = { count: 0, totals: [] };

// The last period is the current month; the rate covers every period.
export function winStats({ periods }: ClosedDeals): WinStats {
  const won = periods.reduce((sum, period) => sum + period.won.count, 0);
  const closed = won + periods.reduce((sum, period) => sum + period.lost.count, 0);
  return {
    wonThisMonth: periods.at(-1)?.won ?? NONE,
    won,
    closed,
    rate: closed === 0 ? null : Math.round((won / closed) * 100),
  };
}
