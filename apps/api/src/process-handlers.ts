import type { EventEmitter } from 'node:events';

import type { Logger } from 'pino';

export const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
export const SHUTDOWN_DEADLINE_MS = 10_000;

export type ExitFn = (code: number) => void;

const defaultExit: ExitFn = (code) => process.exit(code);

export function registerFatalHandlers(
  target: EventEmitter,
  logger: Logger,
  exit: ExitFn = defaultExit,
): void {
  target.on('uncaughtException', (error: unknown) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    exit(1);
  });
  target.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    exit(1);
  });
}

// Nest ignores repeated signals while shutting down, so a hung request would block even a second
// Ctrl+C. The timer is unref'd and the exit listener clears it, so it never delays a clean exit.
export function registerShutdownDeadline(
  target: EventEmitter,
  logger: Logger,
  exit: ExitFn = defaultExit,
): void {
  let timer: NodeJS.Timeout | undefined;
  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info({ signal, deadlineMs: SHUTDOWN_DEADLINE_MS }, 'Shutting down');
    timer ??= setTimeout(() => {
      logger.fatal({ deadlineMs: SHUTDOWN_DEADLINE_MS }, 'Graceful shutdown timed out');
      exit(1);
    }, SHUTDOWN_DEADLINE_MS).unref();
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    target.once(signal, handleSignal);
  }
  target.once('exit', () => {
    clearTimeout(timer);
  });
}
