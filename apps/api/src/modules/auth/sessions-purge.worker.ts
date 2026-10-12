import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { SessionsRepository } from './sessions.repository.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';
import { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

export const SESSIONS_QUEUE = 'sessions';
export const SESSIONS_QUEUE_TOKEN = Symbol('SessionsQueue');
export const PURGE_SESSIONS_JOB = 'purge-sessions';

const PURGE_PERIOD_MS = 24 * 60 * 60_000;
const BATCH_SIZE = 1000;

// Sessions past their absolute end can never refresh again; their refresh tokens go by cascade.
@Injectable()
export class SessionsPurgeWorker implements OnModuleInit {
  private readonly logger = new Logger(SessionsPurgeWorker.name);

  constructor(
    private readonly queues: QueueFactory,
    private readonly recurringJobs: RecurringJobs,
    @Inject(SESSIONS_QUEUE_TOKEN) private readonly queue: Queue,
    private readonly sessions: SessionsRepository,
  ) {}

  onModuleInit(): void {
    this.queues.createWorker(SESSIONS_QUEUE, () => this.purge(), { concurrency: 1 });
    this.recurringJobs.register({
      queue: this.queue,
      name: PURGE_SESSIONS_JOB,
      periodMs: PURGE_PERIOD_MS,
    });
  }

  async purge(): Promise<number> {
    const now = new Date();
    let count = 0;
    let deleted: number;
    do {
      deleted = await this.sessions.deleteExpired(now, BATCH_SIZE);
      count += deleted;
    } while (deleted === BATCH_SIZE);
    this.logger.log({ count }, 'Expired sessions purged');
    return count;
  }
}
