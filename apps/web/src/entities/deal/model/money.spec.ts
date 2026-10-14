import { describe, expect, it } from 'vitest';

import { columnSummary } from './money';

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

  it('should show the count alone when the column is empty', () => {
    expect(columnSummary(0, [])).toBe('0 deals');
  });
});
