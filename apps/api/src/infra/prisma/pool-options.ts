import type { AppConfig } from '../config/app-config.js';

// The fields of pg's PoolConfig that the API sets; pg itself is a dependency of the adapter only.
export interface PoolOptions {
  readonly connectionString: string;
  readonly connectionTimeoutMillis: number;
  readonly statement_timeout: number;
  readonly query_timeout: number;
  readonly idleTimeoutMillis: number;
}

// pg waits forever by default: connects to a host that drops packets would pile up in the pool.
const CONNECTION_TIMEOUT_MS = 5000;
// Sent at connect, so Postgres itself cancels a statement that runs longer.
const STATEMENT_TIMEOUT_MS = 10_000;
// Client side, for a dead connection; a pooled query that times out destroys its client.
const QUERY_TIMEOUT_MS = 15_000;
// Idle connections close soon after the last request, so an idle API lets Neon scale to zero.
const IDLE_TIMEOUT_MS = 10_000;

export function createPoolOptions(config: AppConfig): PoolOptions {
  return {
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  };
}
