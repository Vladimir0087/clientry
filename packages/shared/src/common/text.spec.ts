import { describe, expect, it } from 'vitest';

import { textSchema } from './text.js';

describe('textSchema', () => {
  it('should accept the text when it has no NUL character', () => {
    const result = textSchema.safeParse('Pixel Studio');

    expect(result.success).toBe(true);
  });

  it('should reject the text when it contains a NUL character', () => {
    const result = textSchema.safeParse(`Ann${String.fromCharCode(0)}`);

    expect(result.success).toBe(false);
  });
});
