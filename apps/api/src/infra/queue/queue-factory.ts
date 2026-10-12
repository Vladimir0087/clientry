import { Injectable, Logger } from '@nestjs/common';
import type {
  BeforeApplicationShutdown,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Job, Processor } from 'bullmq';

import { describeJobFailure } from './job-failure.js';
import { JobsSettings } from './jobs-settings.js';
import { createProducerConnection, createWorkerConnection } from './queue-connections.js';
import { AppConfig } from '../config/app-config.js';

export interface WorkerSettings {
  readonly concurrency: number;
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);
const CONNECTION_ERROR_MESSAGE = /Connection is closed|Command timed out|max retries per request/i;

function isConnectionError(error: Error): boolean {
  const code: unknown = Reflect.get(error, 'code');
  const hasConnectionCode = typeof code === 'string' && CONNECTION_ERROR_CODES.has(code);
  return hasConnectionCode || CONNECTION_ERROR_MESSAGE.test(error.message);
}

// Owns every queue and worker, so modules never close their own and the closing order is fixed:
// workers before the HTTP server, queues with Prisma after it.
@Injectable()
export class QueueFactory
  implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(QueueFactory.name);
  private readonly queues: Queue[] = [];
  private readonly workers: Worker[] = [];
  private readonly readyWorkers = new WeakSet<Worker>();

  constructor(
    private readonly config: AppConfig,
    private readonly settings: JobsSettings,
  ) {}

  createQueue(name: string): Queue {
    const queue = new Queue(name, {
      connection: createProducerConnection(this.config.redisUrl),
      // Waiting for ready would hold an add for the whole outage, and a version check that fails
      // while Valkey is down would break the queue for good.
      skipWaitingForReady: true,
      skipVersionCheck: true,
    });
    queue.on('error', (error) => {
      this.logConnectionError(name, error);
    });
    this.queues.push(queue);
    return queue;
  }

  // Without running jobs no worker is created, so it opens no connections either.
  createWorker(name: string, processor: Processor, { concurrency }: WorkerSettings): void {
    if (!this.settings.shouldRunJobs) {
      return;
    }
    const worker = new Worker(name, processor, {
      connection: createWorkerConnection(this.config.redisUrl),
      autorun: false,
      concurrency,
    });
    worker.on('ready', () => {
      this.readyWorkers.add(worker);
    });
    worker.on('error', (error) => {
      this.logConnectionError(name, error);
    });
    worker.on('failed', (job, error) => {
      this.logFailure(name, job, error);
    });
    this.workers.push(worker);
  }

  onApplicationBootstrap(): void {
    for (const worker of this.workers) {
      worker.run().catch((error: unknown) => {
        this.logger.error({ err: error, queue: worker.name }, 'Worker stopped');
      });
    }
    if (this.workers.length > 0) {
      this.logger.log({ queues: this.workers.map(({ name }) => name) }, 'Workers started');
    }
  }

  // Waits for active jobs; one cut off by the shutdown deadline is retried after the restart.
  async beforeApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((worker) => this.closeWorker(worker)));
    if (this.workers.length > 0) {
      this.logger.log('Workers closed');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.queues.map((queue) => this.closeQueue(queue)));
    this.logger.log('Queue connections closed');
  }

  // A graceful close waits for both connections to end, which never happens to one that is down. A
  // worker that never connected has no job; a job cut off here is delivered once after the restart.
  private async closeWorker(worker: Worker): Promise<void> {
    const isConnected =
      this.readyWorkers.has(worker) &&
      (await worker.backend.client).status === 'ready' &&
      (await worker.backend.blockingClient)?.status === 'ready';
    await worker.close(!isConnected);
  }

  // Without Valkey quit waits behind the commands left in ioredis's offline queue and then fails;
  // dropping the connection loses nothing at shutdown.
  private async closeQueue(queue: Queue): Promise<void> {
    const client = await queue.backend.client;
    try {
      if (client.status === 'ready') {
        await queue.close();
        return;
      }
    } catch (error) {
      this.logger.warn({ err: error, queue: queue.name }, 'Queue did not close cleanly');
    }
    client.disconnect();
  }

  // ioredis reports every reconnect attempt; the probe client already logs the outage once.
  private logConnectionError(queue: string, error: Error): void {
    if (isConnectionError(error)) {
      this.logger.debug({ err: error, queue }, 'Queue connection error');
      return;
    }
    this.logger.warn({ err: error, queue }, 'Queue error');
  }

  private logFailure(queue: string, job: Job | undefined, error: Error): void {
    const { isFinal, context } = describeJobFailure(queue, job, error);
    if (isFinal) {
      this.logger.error(context, 'Job failed');
      return;
    }
    this.logger.warn(context, 'Job failed, retrying');
  }
}
