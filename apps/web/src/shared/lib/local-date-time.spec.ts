import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toDateInput, toInstant, toTimeInput } from './local-date-time';

// Berlin moves its clocks: CEST is UTC+2 in October; 02:00-03:00 never happens on 2026-03-29 and
// happens twice on 2026-10-25, first in CEST, then in CET.
const ZONE = 'Europe/Berlin';

describe('local-date-time', () => {
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

  it('should read the date and time in the browser zone when both are given', () => {
    expect(toInstant('2026-10-15', '15:00')).toBe('2026-10-15T13:00:00.000Z');
  });

  it('should give back the typed date and time when an instant is shown in the browser zone', () => {
    expect(toDateInput('2026-10-15T13:00:00.000Z')).toBe('2026-10-15');
    expect(toTimeInput('2026-10-15T13:00:00.000Z')).toBe('15:00');
  });

  it('should show the local date when the instant falls on the previous day in UTC', () => {
    expect(toDateInput('2026-10-14T22:30:00.000Z')).toBe('2026-10-15');
    expect(toTimeInput('2026-10-14T22:30:00.000Z')).toBe('00:30');
  });

  it('should move a time forward when the clock change skips it', () => {
    expect(toInstant('2026-03-29', '02:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('should take the first pass when the clock change repeats the time', () => {
    expect(toInstant('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it.each([
    ['', '09:00'],
    ['2026-10-15', ''],
    ['15.10.2026', '09:00'],
  ])('should give null when the date is %j and the time %j', (date, time) => {
    expect(toInstant(date, time)).toBeNull();
  });
});
