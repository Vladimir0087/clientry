import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { createApp } from './configure-app.js';
import { loadConfigOrExit } from './infra/config/load-config-or-exit.js';
import { createLogger } from './infra/logger/create-logger.js';
import {
  registerFatalHandlers,
  registerShutdownDeadline,
  SHUTDOWN_SIGNALS,
} from './process-handlers.js';

const config = loadConfigOrExit();
const logger = createLogger(config);
registerFatalHandlers(process, logger);

try {
  const app = await createApp((adapter, options) =>
    NestFactory.create<NestExpressApplication>(
      AppModule.forRoot({ config, logger, shouldRunJobs: true }),
      adapter,
      options,
    ),
  );
  app.enableShutdownHooks([...SHUTDOWN_SIGNALS], { useProcessExit: true });
  registerShutdownDeadline(process, logger);
  await app.listen(config.port);
  new Logger('Bootstrap').log(
    { version: config.appVersion },
    `API listening on port ${String(config.port)}`,
  );
} catch (error) {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
}
