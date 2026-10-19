import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { DemoResetService } from './demo-reset.service.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';
import { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

export const DEMO_QUEUE = 'demo';
export const DEMO_QUEUE_TOKEN = Symbol('DemoQueue');
export const RESET_DEMO_JOB = 'reset-demo';

const RESET_PERIOD_MS = 24 * 60 * 60_000;

// The first tick against a Valkey without the job's deduplication key resets at once: after a
// deploy, after Valkey loses its data, and on a new database, where it creates the demo.
@Injectable()
export class DemoResetWorker implements OnModuleInit {
  constructor(
    private readonly queues: QueueFactory,
    private readonly recurringJobs: RecurringJobs,
    @Inject(DEMO_QUEUE_TOKEN) private readonly queue: Queue,
    private readonly demo: DemoResetService,
  ) {}

  onModuleInit(): void {
    this.queues.createWorker(DEMO_QUEUE, () => this.process(), { concurrency: 1 });
    this.recurringJobs.register({
      queue: this.queue,
      name: RESET_DEMO_JOB,
      periodMs: RESET_PERIOD_MS,
    });
  }

  process(): Promise<void> {
    return this.demo.reset(new Date());
  }
}
