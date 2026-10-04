import { RequestMethod } from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { AppExpressAdapter } from './common/http/app-express-adapter.js';
import { requestIdMiddleware } from './common/http/request-id.js';
import { setupSwagger } from './common/http/setup-swagger.js';
import { AppConfig } from './infra/config/app-config.js';
import { ROOT_LOGGER } from './infra/logger/app-logger.module.js';
import { createHttpLoggerOptions } from './infra/logger/http-logger-options.js';

const API_PREFIX = 'api';

// abortOnError would call process.abort() on a DI error; let the caller handle the rejection.
const APP_OPTIONS: NestApplicationOptions = { bufferLogs: true, abortOnError: false };

export type AppFactory = (
  adapter: AppExpressAdapter,
  options: NestApplicationOptions,
) => NestExpressApplication | Promise<NestExpressApplication>;

function configureApp(app: NestExpressApplication): void {
  const logger = app.get<Logger>(ROOT_LOGGER);
  app.useLogger(app.get(NestPinoLogger));
  // With 0 hops X-Forwarded-For is ignored, so a direct client cannot pick the IP it is limited by.
  app.set('trust proxy', app.get(AppConfig).trustProxyHops);
  // Mounted before Nest's body parser, so even a malformed body gets an id and a log line.
  app.use(requestIdMiddleware, pinoHttp(createHttpLoggerOptions(logger)));
  // Unsigned: the access token is a signed JWT and the refresh token is random.
  app.use(cookieParser());
  // Registered where it is called, so it runs after the request id and logger middleware.
  app.useSecurityHeaders({
    // Plain-http local runs would otherwise load Swagger UI assets over https and fail.
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
  // Probes are called by the host and the pinger directly, not through the /api proxy.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'health/{*path}', method: RequestMethod.GET }],
  });
  setupSwagger(app);
}

// main.ts and the test harness differ only in how Nest builds the app: the same adapter, options
// and setup, so tests exercise the production pipeline.
export async function createApp(create: AppFactory): Promise<NestExpressApplication> {
  const app = await create(new AppExpressAdapter(), APP_OPTIONS);
  configureApp(app);
  return app;
}
