import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { createRedisOptions } from './redis-options.js';
import { AppConfig } from '../config/app-config.js';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private isAvailable: boolean | undefined;

  constructor(config: AppConfig) {
    this.client = new Redis(config.redisUrl, createRedisOptions());
    this.client.on('ready', () => {
      this.setAvailable(true);
    });
    this.client.on('error', (error: Error) => {
      this.setAvailable(false, error);
    });
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
    this.logger.log('Redis connection closed');
  }

  // ioredis emits an error on every reconnect attempt; log only when the state changes.
  private setAvailable(isAvailable: boolean, error?: Error): void {
    if (this.isAvailable === isAvailable) {
      return;
    }
    this.isAvailable = isAvailable;
    if (isAvailable) {
      this.logger.log('Redis connection ready');
      return;
    }
    this.logger.warn({ err: error }, 'Redis connection lost, reconnecting');
  }
}
