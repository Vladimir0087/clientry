import type { Currency, CurrencyTotal } from '@clientry/shared/deals';

// Every supported currency has two minor digits.
const MINOR_PER_MAJOR = 100;

const formatters = new Map<Currency, Intl.NumberFormat>();
const compactFormatters = new Map<Currency, Intl.NumberFormat>();

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

function compactFormatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = compactFormatters.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    compactFormatters.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(amount: number, currency: Currency): string {
  return formatterFor(currency).format(amount / MINOR_PER_MAJOR);
}

// For chart labels: "$12.5K".
export function formatCompactMoney(amount: number, currency: Currency): string {
  return compactFormatterFor(currency).format(amount / MINOR_PER_MAJOR);
}

// Currencies are never added up: "$4,500 · €1,200".
export function formatTotals(totals: readonly CurrencyTotal[]): string {
  return totals.map((total) => formatMoney(total.amount, total.currency)).join(' · ');
}
