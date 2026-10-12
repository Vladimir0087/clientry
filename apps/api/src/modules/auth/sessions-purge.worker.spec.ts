import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { SessionsPurgeWorker } from './sessions-purge.worker.js';
import type { SessionsRepository } from './sessions.repository.js';
import type { QueueFactory } from '../../infra/queue/queue-factory.js';
import type { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

describe('SessionsPurgeWorker', () => {
  let createWorker: Mock<QueueFactory['createWorker']>;
  let register: Mock<RecurringJobs['register']>;
  let deleteExpired: Mock<SessionsRepository['deleteExpired']>;
  let queue: Queue;
  let worker: SessionsPurgeWorker;

  beforeEach(() => {
    createWorker = vi.fn<QueueFactory['createWorker']>();
    register = vi.fn<RecurringJobs['register']>();
    deleteExpired = vi.fn<SessionsRepository['deleteExpired']>();
    queue = {} as Queue;
    worker = new SessionsPurgeWorker(
      { createWorker } as unknown as QueueFactory,
      { register } as unknown as RecurringJobs,
      queue,
      { deleteExpired } as unknown as SessionsRepository,
    );
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the worker and register the daily purge when the module starts', () => {
    worker.onModuleInit();

    expect(createWorker).toHaveBeenCalledWith('sessions', expect.any(Function), {
      concurrency: 1,
    });
    expect(register).toHaveBeenCalledWith({
      queue,
      name: 'purge-sessions',
      periodMs: 24 * 60 * 60_000,
    });
  });

  it('should delete in batches of 1 000 when more sessions than one batch have ended', async () => {
    deleteExpired.mockResolvedValueOnce(1000).mockResolvedValueOnce(1000).mockResolvedValue(7);

    await expect(worker.purge()).resolves.toBe(2007);
    expect(deleteExpired).toHaveBeenCalledTimes(3);
    expect(deleteExpired).toHaveBeenCalledWith(expect.any(Date), 1000);
  });

  it('should run one statement when nothing has expired', async () => {
    deleteExpired.mockResolvedValue(0);

    await expect(worker.purge()).resolves.toBe(0);
    expect(deleteExpired).toHaveBeenCalledOnce();
  });
});
