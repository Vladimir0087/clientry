import { describe, expect, it } from 'vitest';

import { livenessResponseSchema } from './liveness.js';

describe('livenessResponseSchema', () => {
  it('should accept the body when it names a version', () => {
    const result = livenessResponseSchema.safeParse({ status: 'ok', version: '0123abc' });

    expect(result.success).toBe(true);
  });

  it.each([
    ['missing', { status: 'ok' }],
    ['empty', { status: 'ok', version: '' }],
  ])('should reject the body when the version is %s', (_case, body) => {
    const result = livenessResponseSchema.safeParse(body);

    expect(result.success).toBe(false);
  });
});
