import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { InvalidConfigError } from './invalid-config-error.js';

const schema = z.object({
  API_URL: z.string({ error: 'is required' }),
  PORT: z.coerce.number({ error: 'must be a number' }),
});

describe('InvalidConfigError', () => {
  it('should name every variable with its reason when built from a zod error', () => {
    const result = schema.safeParse({ PORT: 'eighty' });
    if (result.success) {
      throw new Error('Expected the schema to reject the input');
    }

    const error = InvalidConfigError.fromZodError(result.error);

    expect(error.issues).toEqual([
      { variable: 'API_URL', reason: 'is required' },
      { variable: 'PORT', reason: 'must be a number' },
    ]);
    expect(error.message).toBe(
      'Invalid environment configuration:\n  API_URL: is required\n  PORT: must be a number',
    );
  });

  it('should keep the input out of the message when a value is rejected', () => {
    const result = schema.safeParse({ API_URL: 'x', PORT: 's3cret' });
    if (result.success) {
      throw new Error('Expected the schema to reject the input');
    }

    const error = InvalidConfigError.fromZodError(result.error);

    expect(error.message).not.toContain('s3cret');
  });
});
