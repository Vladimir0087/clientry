import { Logger } from '@nestjs/common';

import { Prisma } from './generated/client.js';

// Postgres ends a deadlock by failing one transaction. Model queries report it as P2034, raw ones
// as P2010 with the adapter's error kind in meta.
const WRITE_CONFLICT = 'P2034';
const RAW_QUERY_FAILED = 'P2010';
const WRITE_CONFLICT_KIND = 'TransactionWriteConflict';

function adapterErrorKind(meta: Record<string, unknown> | undefined): unknown {
  const adapterError = meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) {
    return undefined;
  }
  const { cause } = adapterError;
  return typeof cause === 'object' && cause !== null && 'kind' in cause ? cause.kind : undefined;
}

function isWriteConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code === WRITE_CONFLICT) {
    return true;
  }
  return error.code === RAW_QUERY_FAILED && adapterErrorKind(error.meta) === WRITE_CONFLICT_KIND;
}

const logger = new Logger('WriteConflictRetry');

// Runs a whole transaction once more when it lost a deadlock: it rolled back, so nothing is doubled.
export async function retryOnWriteConflict<T>(
  run: () => Promise<T>,
  context: Readonly<Record<string, string>>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isWriteConflict(error)) {
      throw error;
    }
    logger.warn(context, 'Write conflict, transaction run again');
    return run();
  }
}
