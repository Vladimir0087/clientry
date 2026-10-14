import { describe, expect, it } from 'vitest';

import { formatCompactMoney, formatMoney, formatTotals } from './money';

describe('formatMoney', () => {
  it('should drop the cents when the amount is whole', () => {
    expect(formatMoney(150000, 'USD')).toBe('$1,500');
  });

  it('should show the cents when the amount has them', () => {
    expect(formatMoney(150050, 'USD')).toBe('$1,500.50');
  });

  it('should use the currency symbol when the currency is EUR', () => {
    expect(formatMoney(150000, 'EUR')).toBe('€1,500');
  });
});

describe('formatCompactMoney', () => {
  it('should shorten thousands to one decimal when the amount is large', () => {
    expect(formatCompactMoney(1_250_000, 'USD')).toBe('$12.5K');
  });

  it('should keep a small amount whole when it has no cents', () => {
    expect(formatCompactMoney(90_000, 'USD')).toBe('$900');
  });
});

describe('formatTotals', () => {
  it('should join a total per currency when the totals mix currencies', () => {
    const totals = [
      { currency: 'USD', amount: 450000, count: 2 },
      { currency: 'EUR', amount: 120000, count: 1 },
    ] as const;

    expect(formatTotals(totals)).toBe('$4,500 · €1,200');
  });
});
