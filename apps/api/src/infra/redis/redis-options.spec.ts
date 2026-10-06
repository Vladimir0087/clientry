import { describe, expect, it } from 'vitest';

import { createRedisOptions } from './redis-options.js';

describe('createRedisOptions', () => {
  it('should time out a command after 2 s when built', () => {
    expect(createRedisOptions().commandTimeout).toBe(2000);
  });

  it('should retry a command once when the connection fails', () => {
    expect(createRedisOptions().maxRetriesPerRequest).toBe(1);
  });

  it.each([
    [200, 1],
    [2000, 10],
    [5000, 100],
  ])('should wait %i ms when reconnect attempt %i is due', (delayMs, attempt) => {
    const { retryStrategy } = createRedisOptions();

    expect(retryStrategy?.(attempt)).toBe(delayMs);
  });
});
