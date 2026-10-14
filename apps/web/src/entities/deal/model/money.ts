import { formatTotals } from '@/shared/lib/money';
import type { Currency, CurrencyTotal } from '@clientry/shared/deals';

const CURRENCY_NAMES = new Intl.DisplayNames('en', { type: 'currency' });

export function currencyName(currency: Currency): string {
  return CURRENCY_NAMES.of(currency) ?? currency;
}

export function pluralizeDeals(count: number): string {
  return `${String(count)} ${count === 1 ? 'deal' : 'deals'}`;
}

// Currencies are never added up: "3 deals · $4,500 · €1,200".
export function columnSummary(count: number, totals: readonly CurrencyTotal[]): string {
  return [pluralizeDeals(count), ...(totals.length > 0 ? [formatTotals(totals)] : [])].join(' · ');
}
