import { EventEmitter } from 'node:events';

import { pino } from 'pino';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerFatalHandlers,
  registerShutdownDeadline,
  SHUTDOWN_DEADLINE_MS,
} from './process-handlers.js';

function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}

describe('registerShutdownDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should log fatal and exit with 1 when cleanup never finishes', () => {
    const target = new EventEmitter();
    const logger = createSilentLogger();
    const fatal = vi.spyOn(logger, 'fatal');
    const exit = vi.fn();
    registerShutdownDeadline(target, logger, exit);

    target.emit('SIGTERM');
    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS - 1);
    const isExitedEarly = exit.mock.calls.length > 0;
    vi.advanceTimersByTime(1);

    expect(isExitedEarly).toBe(false);
    expect(fatal).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('should not fire when the process exits before the deadline', () => {
    const target = new EventEmitter();
    const logger = createSilentLogger();
    const fatal = vi.spyOn(logger, 'fatal');
    const exit = vi.fn();
    registerShutdownDeadline(target, logger, exit);

    target.emit('SIGINT');
    target.emit('exit', 0);
    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS);

    expect(fatal).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('should not start the timer when no signal arrives', () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    registerShutdownDeadline(target, createSilentLogger(), exit);

    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS);

    expect(exit).not.toHaveBeenCalled();
  });
});

describe('registerFatalHandlers', () => {
  it.each(['uncaughtException', 'unhandledRejection'])(
    'should log fatal and exit with 1 when %s is emitted',
    (event) => {
      const target = new EventEmitter();
      const logger = createSilentLogger();
      const fatal = vi.spyOn(logger, 'fatal');
      const exit = vi.fn();
      registerFatalHandlers(target, logger, exit);

      target.emit(event, new Error('boom'));

      expect(fatal).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );
});
