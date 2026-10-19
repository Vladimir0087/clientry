import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger as NestPinoLogger } from 'nestjs-pino';

import { loadConfigOrExit } from './infra/config/load-config-or-exit.js';
import { createLogger } from './infra/logger/create-logger.js';
import { DemoResetService } from './modules/demo/demo-reset.service.js';
import { DemoSeedModule } from './modules/demo/demo-seed.module.js';

// `prisma db seed`: one demo reset in a standalone context, the same rows the daily job writes.
const config = loadConfigOrExit();
const logger = createLogger(config);

try {
  const app = await NestFactory.createApplicationContext(
    DemoSeedModule.forRoot({ config, logger }),
    { bufferLogs: true, abortOnError: false },
  );
  app.useLogger(app.get(NestPinoLogger));
  try {
    await app.get(DemoResetService).reset(new Date());
  } finally {
    await app.close();
  }
} catch (error) {
  logger.fatal({ err: error }, 'Demo seed failed');
  // Not process.exit(): the logger's transport still has to flush.
  process.exitCode = 1;
}
