import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotReadyError } from './errors.js';
import type { HealthRepository } from './health.repository.js';
import { CHECK_TIMEOUT_MS, HealthService } from './health.service.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';
import type { RedisService } from '../../infra/redis/redis.service.js';

interface Probes {
  readonly database: () => Promise<void>;
  readonly redis: () => Promise<void>;
}

const UP = (): Promise<void> => Promise.resolve();
const DOWN = (): Promise<void> => Promise.reject(new Error('ECONNREFUSED'));
const HANGING = (): Promise<void> =>
  new Promise<void>(() => {
    // never settles
  });

const APP_VERSION = '0123abc';

function createService({ database, redis }: Probes): HealthService {
  const repository: HealthRepository = { pingDatabase: vi.fn(database) };
  // satisfies keeps the mock in step with RedisService; the cast only drops its private fields.
  const redisService = { ping: vi.fn(redis) } satisfies Pick<RedisService, 'ping'>;
  return new HealthService(
    repository,
    redisService as unknown as RedisService,
    createUnitConfig({ APP_VERSION }),
  );
}

async function captureNotReady(promise: Promise<unknown>): Promise<NotReadyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof NotReadyError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected readiness to fail');
}

describe('HealthService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should report ok with the configured version when the process is alive', () => {
    const service = createService({ database: UP, redis: UP });

    expect(service.getLiveness()).toEqual({ status: 'ok', version: APP_VERSION });
  });

  it('should report ok when both dependencies are up', async () => {
    const service = createService({ database: UP, redis: UP });

    const readiness = await service.getReadiness();

    expect(readiness).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('should throw NOT_READY with checks when one dependency is down', async () => {
    const service = createService({ database: UP, redis: DOWN });

    const error = await captureNotReady(service.getReadiness());

    expect(error.code).toBe('NOT_READY');
    expect(error.extensions).toEqual({ checks: { database: 'up', redis: 'down' } });
  });

  it('should report down when a check never resolves within the timeout', async () => {
    vi.useFakeTimers();
    const service = createService({ database: HANGING, redis: UP });

    let isSettled = false;
    const readiness = captureNotReady(service.getReadiness()).finally(() => {
      isSettled = true;
    });
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 1);
    const isSettledEarly = isSettled;
    await vi.advanceTimersByTimeAsync(1);
    const error = await readiness;

    expect(isSettledEarly).toBe(false);
    expect(error.extensions).toEqual({ checks: { database: 'down', redis: 'up' } });
  });
});
