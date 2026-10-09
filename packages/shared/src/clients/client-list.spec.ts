import { describe, expect, it } from 'vitest';

import { clientListQuerySchema } from './client-list.js';

const NUL = String.fromCharCode(0);

describe('clientListQuerySchema', () => {
  it('should default the sort to newest and the limit to 25 when neither is given', () => {
    expect(clientListQuerySchema.parse({})).toEqual({ sort: 'newest', limit: 25 });
  });

  it('should read the limit as a number when it arrives as a string', () => {
    expect(clientListQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it.each(['0', '101', 'abc'])('should reject the limit when it is %s', (limit) => {
    expect(clientListQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('should accept the source when it is a single string', () => {
    expect(clientListQuerySchema.parse({ source: 'telegram' }).source).toBe('telegram');
  });

  it('should accept the source when it is an array', () => {
    const query = clientListQuerySchema.parse({ source: ['telegram', 'website'] });

    expect(query.source).toEqual(['telegram', 'website']);
  });

  it('should reject the source when it is unknown', () => {
    expect(clientListQuerySchema.safeParse({ source: 'fax' }).success).toBe(false);
  });

  it('should reject the source when it has five values', () => {
    const source = ['website', 'telegram', 'referral', 'other', 'website'];

    expect(clientListQuerySchema.safeParse({ source }).success).toBe(false);
  });

  it('should reject createdBy when it is not me', () => {
    const result = clientListQuerySchema.safeParse({
      createdBy: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    });

    expect(result.success).toBe(false);
  });

  it('should reject q when it has 101 characters', () => {
    expect(clientListQuerySchema.safeParse({ q: 'q'.repeat(101) }).success).toBe(false);
  });

  it('should reject q when it contains a NUL character', () => {
    expect(clientListQuerySchema.safeParse({ q: `a${NUL}` }).success).toBe(false);
  });
});
