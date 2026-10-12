import { UnrecoverableError } from 'bullmq';
import type { Job, Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { RemindersService } from './reminders.service.js';
import { RemindersWorker } from './reminders.worker.js';
import type { QueueFactory } from '../../infra/queue/queue-factory.js';
import type { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

const REMINDER = {
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  taskId: '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a',
  remindAt: '2026-10-15T06:00:00.000Z',
};

function job(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

describe('RemindersWorker', () => {
  let createWorker: Mock<QueueFactory['createWorker']>;
  let register: Mock<RecurringJobs['register']>;
  let deliver: Mock<RemindersService['deliver']>;
  let sweep: Mock<RemindersService['sweep']>;
  let queue: Queue;
  let worker: RemindersWorker;

  beforeEach(() => {
    createWorker = vi.fn<QueueFactory['createWorker']>();
    register = vi.fn<RecurringJobs['register']>();
    deliver = vi.fn<RemindersService['deliver']>().mockResolvedValue({
      isDelivered: false,
      reason: 'sent',
    });
    sweep = vi.fn<RemindersService['sweep']>().mockResolvedValue(0);
    queue = {} as Queue;
    worker = new RemindersWorker(
      { createWorker } as unknown as QueueFactory,
      { register } as unknown as RecurringJobs,
      queue,
      { deliver, sweep } as unknown as RemindersService,
    );
  });

  it('should create the worker and register the hourly sweep when the module starts', () => {
    worker.onModuleInit();

    expect(createWorker).toHaveBeenCalledWith('reminders', expect.any(Function), {
      concurrency: 2,
    });
    expect(register).toHaveBeenCalledWith({
      queue,
      name: 'sweep-reminders',
      periodMs: 60 * 60_000,
    });
  });

  it('should deliver the reminder from the job data when a deliver-reminder job runs', async () => {
    await worker.process(job('deliver-reminder', REMINDER));

    expect(deliver).toHaveBeenCalledWith(REMINDER);
    expect(sweep).not.toHaveBeenCalled();
  });

  it('should run the sweep when a sweep-reminders job runs', async () => {
    await worker.process(job('sweep-reminders'));

    expect(sweep).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('should fail without retries and deliver nothing when the job data does not parse', async () => {
    const run = worker.process(job('deliver-reminder', { ...REMINDER, taskId: 'not-a-uuid' }));

    await expect(run).rejects.toBeInstanceOf(UnrecoverableError);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('should fail without retries when the job name is unknown', async () => {
    const run = worker.process(job('send-digest'));

    await expect(run).rejects.toBeInstanceOf(UnrecoverableError);
    expect(deliver).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
  });
});
