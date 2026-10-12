import { describe, expect, it } from 'vitest';

import { columnSummary, formatMoney } from './money';

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

describe('columnSummary', () => {
  it('should list the count and a total per currency when the column mixes currencies', () => {
    const totals = [
      { currency: 'USD', amount: 450000, count: 2 },
      { currency: 'EUR', amount: 120000, count: 1 },
    ] as const;

    expect(columnSummary(3, totals)).toBe('3 deals · $4,500 · €1,200');
  });

  it('should use the singular when the column holds one deal', () => {
    expect(columnSummary(1, [{ currency: 'USD', amount: 100, count: 1 }])).toBe('1 deal · $1');
  });
});
