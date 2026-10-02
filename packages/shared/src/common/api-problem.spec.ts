import { describe, expect, it } from 'vitest';

import { apiProblemSchema } from './api-problem.js';

const VALID_BODY = {
  type: 'about:blank',
  title: 'Bad Request',
  status: 400,
  code: 'VALIDATION_FAILED',
  requestId: 'req-1',
};

describe('apiProblemSchema', () => {
  it('should accept the body when field errors are present', () => {
    const body = { ...VALID_BODY, errors: [{ path: 'email', message: 'Invalid email address' }] };

    const result = apiProblemSchema.safeParse(body);

    expect(result.data).toEqual(body);
  });

  it('should accept the body when the code is not known to the client', () => {
    const result = apiProblemSchema.safeParse({ ...VALID_BODY, code: 'SOMETHING_NEW' });

    expect(result.success).toBe(true);
  });

  it.each(['code', 'requestId'])('should reject the body when %s is missing', (member) => {
    const result = apiProblemSchema.safeParse({ ...VALID_BODY, [member]: undefined });

    expect(result.success).toBe(false);
  });
});
