import type { ClosedDeals } from '@clientry/shared/dashboard';
import type { Currency } from '@clientry/shared/deals';

// The currencies with won deals in the periods, by won count, then code.
export function wonCurrencies({ periods }: ClosedDeals): Currency[] {
  const counts = new Map<Currency, number>();
  for (const { won } of periods) {
    for (const total of won.totals) {
      counts.set(total.currency, (counts.get(total.currency) ?? 0) + total.count);
    }
  }
  return [...counts.entries()]
    .toSorted(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([currency]) => currency);
}
