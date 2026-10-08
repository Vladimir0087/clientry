import { Injectable, Logger } from '@nestjs/common';

import type {
  DependencyStatus,
  LivenessResponse,
  ReadinessChecks,
  ReadinessResponse,
} from '@clientry/shared/health';

import { CheckTimeoutError } from './check-timeout.error.js';
import { NotReadyError } from './errors.js';
import { HealthRepository } from './health.repository.js';
import { AppConfig } from '../../infra/config/app-config.js';
import { RedisService } from '../../infra/redis/redis.service.js';

export const CHECK_TIMEOUT_MS = 3000;

async function withTimeout(probe: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new CheckTimeoutError(CHECK_TIMEOUT_MS));
    }, CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly health: HealthRepository,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  getLiveness(): LivenessResponse {
    return { status: 'ok', version: this.config.appVersion };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.check('database', () => this.health.pingDatabase()),
      this.check('redis', () => this.redis.ping()),
    ]);
    const checks: ReadinessChecks = { database, redis };
    if (database === 'down' || redis === 'down') {
      throw new NotReadyError(checks);
    }
    return { status: 'ok', checks };
  }

  private async check(
    name: keyof ReadinessChecks,
    probe: () => Promise<void>,
  ): Promise<DependencyStatus> {
    try {
      await withTimeout(probe());
      return 'up';
    } catch (error) {
      this.logger.warn({ err: error, check: name }, 'Readiness check failed');
      return 'down';
    }
  }
}
