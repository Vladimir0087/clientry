import { describe, expect, it } from 'vitest';

import { closedDealsQuerySchema } from './closed-deals.js';

const MESSAGE = 'Use 2 to 13 bounds in ascending order';

function monthStarts(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(2026, 3 + index, 1)).toISOString(),
  );
}

function messages(bounds: unknown): { path: PropertyKey[]; message: string }[] {
  const result = closedDealsQuerySchema.safeParse({ bounds });
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
}

describe('closedDealsQuerySchema', () => {
  it('should accept the bounds when seven ascend', () => {
    const bounds = monthStarts(7);

    expect(closedDealsQuerySchema.parse({ bounds })).toEqual({ bounds });
  });

  it('should reject the bounds when only one is given', () => {
    expect(messages(monthStarts(1)[0])).toEqual([{ path: ['bounds'], message: MESSAGE }]);
  });

  it('should reject the bounds when 14 are given', () => {
    expect(messages(monthStarts(14))).toEqual([{ path: ['bounds'], message: MESSAGE }]);
  });

  it('should reject the bounds when two neighbours are equal', () => {
    const [first = '', second = ''] = monthStarts(2);

    expect(messages([first, second, second])).toEqual([{ path: ['bounds'], message: MESSAGE }]);
  });

  it('should reject the bounds when a neighbour descends', () => {
    expect(messages(monthStarts(3).toReversed())).toEqual([{ path: ['bounds'], message: MESSAGE }]);
  });

  it('should reject the bounds when one has an offset other than Z', () => {
    const [first = ''] = monthStarts(1);

    expect(messages([first, '2026-05-01T03:00:00.000+03:00'])).toEqual([
      { path: ['bounds'], message: MESSAGE },
    ]);
  });

  it('should reject the bounds when one lies outside 2000 to 2099', () => {
    expect(messages(['1999-12-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z'])).toEqual([
      { path: ['bounds'], message: MESSAGE },
    ]);
  });
});
