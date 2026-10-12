import { Injectable, Logger } from '@nestjs/common';
import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { JobsSettings } from './jobs-settings.js';

export const TICK_INTERVAL_MS = 5 * 60_000;
// A failed run is retried: its deduplication key holds back the next add for a whole period.
const ATTEMPTS = 3;
const BACKOFF_MS = 10_000;

export interface RecurringJob {
  readonly queue: Queue;
  readonly name: string;
  readonly periodMs: number;
}

// In the process, as BullMQ's job schedulers vanish with Valkey's data. Deduplication ignores an
// add while one added less than a period ago exists, however many ticks or instances there are.
@Injectable()
export class RecurringJobs implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(RecurringJobs.name);
  private readonly jobs: RecurringJob[] = [];
  private timer: NodeJS.Timeout | undefined;
  private isFailing = false;

  constructor(private readonly settings: JobsSettings) {}

  // Called from onModuleInit, so every job is registered before the first tick.
  register(job: RecurringJob): void {
    this.jobs.push(job);
  }

  // Never rejects: a failed tick is logged and the next one tries again.
  async tick(): Promise<void> {
    try {
      await Promise.all(
        this.jobs.map(({ queue, name, periodMs }) =>
          queue.add(
            name,
            {},
            {
              deduplication: { id: name, ttl: periodMs },
              attempts: ATTEMPTS,
              backoff: { type: 'exponential', delay: BACKOFF_MS },
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        ),
      );
      this.setFailing(false);
    } catch (error) {
      this.setFailing(true, error);
    }
  }

  onApplicationBootstrap(): void {
    if (!this.settings.shouldRunJobs) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS).unref();
    void this.tick();
  }

  beforeApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private setFailing(isFailing: boolean, error?: unknown): void {
    if (this.isFailing === isFailing) {
      return;
    }
    this.isFailing = isFailing;
    if (isFailing) {
      this.logger.warn({ err: error }, 'Could not add recurring jobs');
      return;
    }
    this.logger.log('Recurring jobs added again');
  }
}
