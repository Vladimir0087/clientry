import type { RedisOptions } from 'ioredis';

// Fail commands fast while Valkey is down; the offline queue still covers the first connect.
const MAX_RETRIES_PER_REQUEST = 1;
const MAX_RECONNECT_DELAY_MS = 5000;
// A connection that stopped answering rejects the command instead of waiting for TCP to notice.
const COMMAND_TIMEOUT_MS = 2000;

export function reconnectDelay(attempt: number): number {
  return Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS);
}

export function createRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
    retryStrategy: reconnectDelay,
    commandTimeout: COMMAND_TIMEOUT_MS,
  };
}
