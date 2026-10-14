import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { periodBounds } from './period-bounds';

// Summer time ends on the last Sunday of October and starts on the last Sunday of March.
const ZONE = 'Europe/Warsaw';

describe('periodBounds', () => {
  const previousZone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = ZONE;
  });

  // Assigning undefined to process.env stores the string "undefined".
  afterAll(() => {
    if (previousZone === undefined) {
      delete process.env.TZ;
      return;
    }
    process.env.TZ = previousZone;
  });

  it('should give seven local month starts from five months back when the month is October', () => {
    expect(periodBounds(new Date(2026, 9, 14, 15))).toEqual([
      '2026-04-30T22:00:00.000Z',
      '2026-05-31T22:00:00.000Z',
      '2026-06-30T22:00:00.000Z',
      '2026-07-31T22:00:00.000Z',
      '2026-08-31T22:00:00.000Z',
      '2026-09-30T22:00:00.000Z',
      '2026-10-31T23:00:00.000Z',
    ]);
  });

  it('should cross into the previous year when the month is February', () => {
    expect(periodBounds(new Date(2027, 1, 10))).toEqual([
      '2026-08-31T22:00:00.000Z',
      '2026-09-30T22:00:00.000Z',
      '2026-10-31T23:00:00.000Z',
      '2026-11-30T23:00:00.000Z',
      '2026-12-31T23:00:00.000Z',
      '2027-01-31T23:00:00.000Z',
      '2027-02-28T23:00:00.000Z',
    ]);
  });

  it('should start the next month in summer time when the clocks change this month', () => {
    const bounds = periodBounds(new Date(2027, 2, 29, 12));

    expect(bounds.at(-2)).toBe('2027-02-28T23:00:00.000Z');
    expect(bounds.at(-1)).toBe('2027-03-31T22:00:00.000Z');
  });
});
