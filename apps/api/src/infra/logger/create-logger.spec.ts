import { describe, expect, it } from 'vitest';

import { createLogger } from './create-logger.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

function logError(err: unknown): Record<string, unknown> {
  const lines: string[] = [];
  const logger = createLogger(createUnitConfig({ LOG_LEVEL: 'info' }), {
    write: (line) => lines.push(line),
  });
  logger.warn({ err }, 'Could not queue a reminder');
  const [line] = lines;
  if (line === undefined) {
    throw new Error('Expected one log line');
  }
  return JSON.parse(line) as Record<string, unknown>;
}

describe('createLogger', () => {
  it('should leave out the command arguments when a Redis reply error is logged', () => {
    const error = Object.assign(new Error('OOM command not allowed'), {
      command: { name: 'evalsha', args: ['{"remindAt":"2026-10-15T06:00:00.000Z"}'] },
    });

    const entry = logError(error);

    expect(entry.err).toMatchObject({ type: 'Error', message: 'OOM command not allowed' });
    expect(JSON.stringify(entry)).not.toMatch(/evalsha|remindAt/);
  });

  it('should keep the other properties when an error is logged', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

    const entry = logError(error);

    expect(entry.err).toMatchObject({ message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' });
  });

  it('should log a value that is not an error as it is', () => {
    const entry = logError('Valkey is down');

    expect(entry.err).toBe('Valkey is down');
  });
});
