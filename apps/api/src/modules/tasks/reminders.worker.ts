import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Queue, UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';

import {
  DELIVER_REMINDER_JOB,
  reminderJobDataSchema,
  REMINDERS_QUEUE,
  REMINDERS_QUEUE_TOKEN,
  SWEEP_REMINDERS_JOB,
} from './reminder-jobs.js';
import type { PendingReminder } from './reminder-queue.js';
import { RemindersService } from './reminders.service.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';
import { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

const SWEEP_PERIOD_MS = 60 * 60_000;
const CONCURRENCY = 2;

// Retrying data that does not parse would fail the same way five times.
function parseJobData(data: unknown): PendingReminder {
  const result = reminderJobDataSchema.safeParse(data);
  if (!result.success) {
    throw new UnrecoverableError('Reminder job data does not parse');
  }
  return result.data;
}

@Injectable()
export class RemindersWorker implements OnModuleInit {
  constructor(
    private readonly queues: QueueFactory,
    private readonly recurringJobs: RecurringJobs,
    @Inject(REMINDERS_QUEUE_TOKEN) private readonly queue: Queue,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    this.queues.createWorker(REMINDERS_QUEUE, (job) => this.process(job), {
      concurrency: CONCURRENCY,
    });
    this.recurringJobs.register({
      queue: this.queue,
      name: SWEEP_REMINDERS_JOB,
      periodMs: SWEEP_PERIOD_MS,
    });
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case DELIVER_REMINDER_JOB:
        await this.reminders.deliver(parseJobData(job.data));
        return;
      case SWEEP_REMINDERS_JOB:
        await this.reminders.sweep();
        return;
      default:
        throw new UnrecoverableError(`Unknown job ${job.name}`);
    }
  }
}
