import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { AppConfig } from '../config/app-config.js';
import { PrismaClient } from './generated/client.js';
import type { Prisma } from './generated/client.js';
import { createPoolOptions } from './pool-options.js';

type LoggedEvent = 'query' | 'warn' | 'error';

// A required log array is what types $on for these events.
type PrismaServiceOptions = Prisma.PrismaClientOptions & {
  log: { emit: 'event'; level: LoggedEvent }[];
};

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaServiceOptions, LoggedEvent>
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg(createPoolOptions(config)),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.$on('query', (event) => {
      this.logger.debug({ query: event.query, durationMs: event.duration }, 'Prisma query');
    });
    this.$on('warn', (event) => {
      this.logger.warn({ target: event.target }, event.message);
    });
    // Emitted for every failed query, handled ones included; real failures reach the caller.
    this.$on('error', (event) => {
      this.logger.debug({ target: event.target }, event.message);
    });
  }

  // Not onModuleDestroy: requests still in flight keep their connections until the server closes.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connections closed');
  }
}
