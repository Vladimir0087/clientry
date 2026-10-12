import type { RedisOptions } from 'bullmq';

import { createRedisOptions, reconnectDelay } from '../redis/redis-options.js';

// A producer fails an add within seconds while Valkey is down, as the probe client does.
export function createProducerConnection(redisUrl: string): RedisOptions {
  const { maxRetriesPerRequest, commandTimeout } = createRedisOptions();
  return { url: redisUrl, maxRetriesPerRequest, commandTimeout, retryStrategy: reconnectDelay };
}

// BullMQ requires a worker to retry forever, and its blocking reads would outlive a command timeout.
export function createWorkerConnection(redisUrl: string): RedisOptions {
  return { url: redisUrl, maxRetriesPerRequest: null, retryStrategy: reconnectDelay };
}
