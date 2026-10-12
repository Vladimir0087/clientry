import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { JobsSettings } from './jobs-settings.js';
import { RecurringJobs, TICK_INTERVAL_MS } from './recurring-jobs.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

interface QueueDouble {
  readonly queue: Queue;
  readonly add: Mock<Queue['add']>;
}

function createQueueDouble(): QueueDouble {
  const add = vi.fn<Queue['add']>().mockResolvedValue({} as Awaited<ReturnType<Queue['add']>>);
  return { queue: { add } as unknown as Queue, add };
}

describe('RecurringJobs', () => {
  let reminders: QueueDouble;
  let sessions: QueueDouble;
  let warnSpy: MockInstance<Logger['warn']>;

  function createClock(shouldRunJobs: boolean): RecurringJobs {
    const clock = new RecurringJobs(new JobsSettings(shouldRunJobs));
    clock.register({ queue: reminders.queue, name: 'sweep-reminders', periodMs: HOUR_MS });
    clock.register({ queue: sessions.queue, name: 'purge-sessions', periodMs: DAY_MS });
    return clock;
  }

  beforeEach(() => {
    reminders = createQueueDouble();
    sessions = createQueueDouble();
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should add each job with its deduplication id, period and retries when a tick runs', async () => {
    await createClock(false).tick();

    expect(reminders.add).toHaveBeenCalledWith(
      'sweep-reminders',
      {},
      {
        deduplication: { id: 'sweep-reminders', ttl: HOUR_MS },
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(sessions.add).toHaveBeenCalledWith(
      'purge-sessions',
      {},
      expect.objectContaining({ deduplication: { id: 'purge-sessions', ttl: DAY_MS } }),
    );
  });

  it('should warn once per failing streak when ticks fail, recover and fail again', async () => {
    const clock = createClock(false);
    reminders.add.mockRejectedValue(new Error('Connection is closed'));

    await clock.tick();
    await clock.tick();
    reminders.add.mockResolvedValue({} as Awaited<ReturnType<Queue['add']>>);
    await clock.tick();
    reminders.add.mockRejectedValue(new Error('Connection is closed'));
    await clock.tick();

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('should tick at startup and every five minutes when jobs run', async () => {
    vi.useFakeTimers();
    const clock = createClock(true);

    clock.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * TICK_INTERVAL_MS);

    expect(reminders.add).toHaveBeenCalledTimes(3);
  });

  it('should not tick by itself when jobs do not run', async () => {
    vi.useFakeTimers();
    const clock = createClock(false);

    clock.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * TICK_INTERVAL_MS);

    expect(reminders.add).not.toHaveBeenCalled();
  });

  it('should stop the timer when the app shuts down', async () => {
    vi.useFakeTimers();
    const clock = createClock(true);
    clock.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    clock.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(2 * TICK_INTERVAL_MS);

    expect(reminders.add).toHaveBeenCalledTimes(1);
  });
});
