import { describe, expect, it } from 'vitest';

import { demoLoginRequestSchema } from './demo.js';

describe('demoLoginRequestSchema', () => {
  it.each(['owner', 'manager'])('should accept the request when the role is %s', (role) => {
    expect(demoLoginRequestSchema.safeParse({ role }).success).toBe(true);
  });

  it.each([
    ['another role', { role: 'admin' }],
    ['no role', {}],
  ])('should reject the request on role when it has %s', (_case, body) => {
    const result = demoLoginRequestSchema.safeParse(body);

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['role']);
  });
});
