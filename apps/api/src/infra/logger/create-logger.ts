import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';

import type { AppConfig } from '../config/app-config.js';

// Response headers, set-cookie included, never reach the log: the response serializer drops them.
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie'];

export function createLogger(config: AppConfig, destination?: DestinationStream): Logger {
  return pino(
    {
      level: config.logLevel,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      // pino-pretty is a dev dependency, absent from the production install.
      transport: config.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    destination,
  );
}
