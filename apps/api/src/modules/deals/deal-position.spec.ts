import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';

import { positionBetween, positionsAfter } from './deal-position.js';

function isAscending(keys: readonly string[]): boolean {
  return keys.every((key, index) => index === 0 || (keys[index - 1] ?? '') < key);
}

describe('deal position', () => {
  const [first = '', second = ''] = positionsAfter(null, 2);

  it('should give a base62 key when the column is empty', () => {
    expect(positionBetween(null, null)).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('should give keys the library reads with its defaults when another writer extends the column', () => {
    const [last = ''] = positionsAfter(null, 1);

    expect(() => generateKeyBetween(last, null)).not.toThrow();
    expect(() =>
      positionBetween(null, generateNKeysBetween(null, null, 1)[0] ?? null),
    ).not.toThrow();
  });

  it('should give a key below the first when the card goes to the top', () => {
    expect(positionBetween(null, first) < first).toBe(true);
  });

  it('should give a key above the last when the card goes to the bottom', () => {
    expect(positionBetween(second, null) > second).toBe(true);
  });

  it('should give a key strictly between two neighbours when the card goes between them', () => {
    const key = positionBetween(first, second);

    expect(first < key && key < second).toBe(true);
  });

  it('should throw when the neighbours are equal, so the upper one must be strictly greater', () => {
    expect(() => positionBetween(first, first)).toThrow();
  });

  it('should keep the column in order when 50 cards in turn go right after the same card', () => {
    const column = [first, second];
    for (let index = 0; index < 50; index += 1) {
      column.splice(1, 0, positionBetween(first, column[1] ?? null));
    }

    expect(column).toHaveLength(52);
    expect(isAscending(column)).toBe(true);
  });

  it('should give ascending keys after the last when several cards are appended', () => {
    const keys = positionsAfter(second, 5);

    expect(keys).toHaveLength(5);
    expect(isAscending([second, ...keys])).toBe(true);
  });
});
