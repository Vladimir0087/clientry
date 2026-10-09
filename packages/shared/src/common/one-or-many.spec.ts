import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { oneOrMany } from './one-or-many.js';

const schema = oneOrMany(z.enum(['a', 'b', 'c']), 2);

describe('oneOrMany', () => {
  it('should accept a single value when it is a string', () => {
    expect(schema.parse('a')).toBe('a');
  });

  it('should accept several values when they are an array', () => {
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('should reject the array when it has more values than the maximum', () => {
    expect(schema.safeParse(['a', 'b', 'c']).success).toBe(false);
  });

  it('should reject the value when the item schema rejects it', () => {
    expect(schema.safeParse('x').success).toBe(false);
  });
});
