import { describe, expect, it } from 'vitest';

import { createProducerConnection, createWorkerConnection } from './queue-connections.js';

const REDIS_URL = 'redis://valkey:6379';

describe('queue connections', () => {
  it('should use the probe options and the URL when a producer connection is built', () => {
    const options = createProducerConnection(REDIS_URL);

    expect(options).toMatchObject({
      url: REDIS_URL,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
    });
    expect(options.retryStrategy?.(10)).toBe(2000);
  });

  it('should retry forever without a command timeout when a worker connection is built', () => {
    const options = createWorkerConnection(REDIS_URL);

    expect(options.url).toBe(REDIS_URL);
    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options).not.toHaveProperty('commandTimeout');
    expect(options.retryStrategy?.(10)).toBe(2000);
  });
});
