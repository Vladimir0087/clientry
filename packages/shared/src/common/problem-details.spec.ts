import { describe, expect, it } from 'vitest';

import { problemDetailsSchema } from './problem-details.js';

const VALID_BODY = { type: 'about:blank', title: 'Not Found', status: 404 };

describe('problemDetailsSchema', () => {
  it('should accept the body when only required members are present', () => {
    const result = problemDetailsSchema.safeParse(VALID_BODY);

    expect(result.success).toBe(true);
  });

  it.each([100, 599])('should accept the body when status is the boundary %s', (status) => {
    const result = problemDetailsSchema.safeParse({ ...VALID_BODY, status });

    expect(result.success).toBe(true);
  });

  it('should keep extension members when the body has unknown members', () => {
    const body = { ...VALID_BODY, requestId: 'req-1' };

    const result = problemDetailsSchema.safeParse(body);

    expect(result.data).toEqual(body);
  });

  it('should reject the body when status is missing', () => {
    const { type, title } = VALID_BODY;

    const result = problemDetailsSchema.safeParse({ type, title });

    expect(result.success).toBe(false);
  });

  it.each([404.5, 99, 600])('should reject the body when status is %s', (status) => {
    const result = problemDetailsSchema.safeParse({ ...VALID_BODY, status });

    expect(result.success).toBe(false);
  });

  it.each(['Not Found', null, [VALID_BODY]])('should reject the body when it is %j', (body) => {
    const result = problemDetailsSchema.safeParse(body);

    expect(result.success).toBe(false);
  });
});
