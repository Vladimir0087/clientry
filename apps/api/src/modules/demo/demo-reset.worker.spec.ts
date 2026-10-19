import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { DemoResetService } from './demo-reset.service.js';
import { DemoResetWorker } from './demo-reset.worker.js';
import type { QueueFactory } from '../../infra/queue/queue-factory.js';
import type { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

const NOW = new Date('2026-10-18T09:41:27.512Z');

describe('DemoResetWorker', () => {
  let createWorker: Mock<QueueFactory['createWorker']>;
  let register: Mock<RecurringJobs['register']>;
  let reset: Mock<DemoResetService['reset']>;
  let queue: Queue;
  let worker: DemoResetWorker;

  beforeEach(() => {
    createWorker = vi.fn<QueueFactory['createWorker']>();
    register = vi.fn<RecurringJobs['register']>();
    reset = vi.fn<DemoResetService['reset']>().mockResolvedValue(undefined);
    queue = {} as Queue;
    worker = new DemoResetWorker(
      { createWorker } as unknown as QueueFactory,
      { register } as unknown as RecurringJobs,
      queue,
      { reset } as unknown as DemoResetService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create one worker and register the daily reset when the module starts', () => {
    worker.onModuleInit();

    expect(createWorker).toHaveBeenCalledWith('demo', expect.any(Function), { concurrency: 1 });
    expect(register).toHaveBeenCalledWith({
      queue,
      name: 'reset-demo',
      periodMs: 24 * 60 * 60_000,
    });
  });

  it('should reset the demo with the current time when its job runs', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    worker.onModuleInit();
    const [[, processor] = []] = createWorker.mock.calls;

    await (processor as () => Promise<void>)();

    expect(reset).toHaveBeenCalledWith(NOW);
  });
});
