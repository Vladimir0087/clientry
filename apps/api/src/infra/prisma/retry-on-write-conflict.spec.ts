import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { Prisma } from './generated/client.js';
import { retryOnWriteConflict } from './retry-on-write-conflict.js';

const CONTEXT = { operation: 'members.remove', workspaceId: 'workspace-1' };

function knownError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed', {
    code,
    clientVersion: 'test',
    meta,
  });
}

// The shape Prisma gives a raw statement that failed in the driver adapter.
function rawQueryError(kind: string): Prisma.PrismaClientKnownRequestError {
  return knownError('P2010', {
    driverAdapterError: { name: 'DriverAdapterError', cause: { kind, originalCode: '40P01' } },
  });
}

describe('retryOnWriteConflict', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run once, return the result and log nothing when the run succeeds', async () => {
    const run = vi.fn<() => Promise<string>>().mockResolvedValue('done');

    await expect(retryOnWriteConflict(run, CONTEXT)).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('should run again and return the second result when the first run loses a deadlock', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(knownError('P2034'))
      .mockResolvedValueOnce('done');

    await expect(retryOnWriteConflict(run, CONTEXT)).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('should log the context once when it runs the transaction again', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(knownError('P2034'))
      .mockResolvedValueOnce('done');

    await retryOnWriteConflict(run, CONTEXT);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(CONTEXT, 'Write conflict, transaction run again');
  });

  it('should run again and return the second result when a raw statement of the first run loses a deadlock', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rawQueryError('TransactionWriteConflict'))
      .mockResolvedValueOnce('done');

    await expect(retryOnWriteConflict(run, CONTEXT)).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('should give up after the second run when it loses a deadlock again', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(knownError('P2034'));

    await expect(retryOnWriteConflict(run, CONTEXT)).rejects.toMatchObject({ code: 'P2034' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('should rethrow without a second run when the error is not a write conflict', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(knownError('P2002'));

    await expect(retryOnWriteConflict(run, CONTEXT)).rejects.toMatchObject({ code: 'P2002' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('should rethrow without a second run when a raw statement fails for another reason', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(rawQueryError('postgres'));

    await expect(retryOnWriteConflict(run, CONTEXT)).rejects.toMatchObject({ code: 'P2010' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('should rethrow without a second run when the error does not come from Prisma', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('boom'));

    await expect(retryOnWriteConflict(run, CONTEXT)).rejects.toThrow('boom');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
