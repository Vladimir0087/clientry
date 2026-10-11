import type { Currency, CurrencyTotal } from '@clientry/shared/deals';

// Every supported currency has two minor digits.
const MINOR_PER_MAJOR = 100;

const formatters = new Map<Currency, Intl.NumberFormat>();
const CURRENCY_NAMES = new Intl.DisplayNames('en', { type: 'currency' });

function formatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      trailingZeroDisplay: 'stripIfInteger',
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(amount: number, currency: Currency): string {
  return formatterFor(currency).format(amount / MINOR_PER_MAJOR);
}

export function currencyName(currency: Currency): string {
  return CURRENCY_NAMES.of(currency) ?? currency;
}

export function pluralizeDeals(count: number): string {
  return `${String(count)} ${count === 1 ? 'deal' : 'deals'}`;
}

// Currencies are never added up: "3 deals · $4,500 · €1,200".
export function columnSummary(count: number, totals: readonly CurrencyTotal[]): string {
  return [
    pluralizeDeals(count),
    ...totals.map((total) => formatMoney(total.amount, total.currency)),
  ].join(' · ');
}
