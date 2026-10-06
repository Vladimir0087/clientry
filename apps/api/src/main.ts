import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { InvalidConfigError } from '@clientry/shared/common';

import { AppModule } from './app.module.js';
import { createApp } from './configure-app.js';
import { loadConfig } from './infra/config/app-config.js';
import type { AppConfig } from './infra/config/app-config.js';
import { createLogger } from './infra/logger/create-logger.js';
import {
  registerFatalHandlers,
  registerShutdownDeadline,
  SHUTDOWN_SIGNALS,
} from './process-handlers.js';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) {
      throw error;
    }
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const logger = createLogger(config);
registerFatalHandlers(process, logger);

try {
  const app = await createApp((adapter, options) =>
    NestFactory.create<NestExpressApplication>(
      AppModule.forRoot({ config, logger }),
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
