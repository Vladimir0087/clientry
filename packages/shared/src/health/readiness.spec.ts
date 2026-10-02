import { describe, expect, it } from 'vitest';

import { readinessProblemSchema } from './readiness.js';

const PROBLEM = {
  type: 'about:blank',
  title: 'Service Unavailable',
  status: 503,
  code: 'NOT_READY',
  requestId: 'req-1',
};

describe('readinessProblemSchema', () => {
  it('should accept the body when every check has a status', () => {
    const result = readinessProblemSchema.safeParse({
      ...PROBLEM,
      checks: { database: 'up', redis: 'down' },
    });

    expect(result.success).toBe(true);
  });

  it('should reject the body when a check status is unknown', () => {
    const result = readinessProblemSchema.safeParse({
      ...PROBLEM,
      checks: { database: 'up', redis: 'degraded' },
    });

    expect(result.success).toBe(false);
  });
});
