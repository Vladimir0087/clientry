import { describe, expect, it } from 'vitest';

import { escapeLikePattern } from './like-pattern.js';

describe('escapeLikePattern', () => {
  it.each([
    ['100%', String.raw`100\%`],
    ['a_b', String.raw`a\_b`],
    [String.raw`a\b`, String.raw`a\\b`],
  ])('should escape %s when it holds a LIKE wildcard or the escape', (text, escaped) => {
    expect(escapeLikePattern(text)).toBe(escaped);
  });

  it('should keep the text unchanged when it is plain', () => {
    expect(escapeLikePattern('Romashka LLC')).toBe('Romashka LLC');
  });
});
