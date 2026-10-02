import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';

export const ROOT_LOGGER = 'ROOT_LOGGER';

@Module({})
export class AppLoggerModule {
  static forRoot(logger: Logger): DynamicModule {
    return {
      module: AppLoggerModule,
      global: true,
      imports: [
        // configureApp mounts pino-http before the body parser; nestjs-pino only binds its
        // req.log to the request context, and logs outside a request through the same pino.
        LoggerModule.forRoot({ pinoHttp: { logger }, useExisting: true }),
      ],
      providers: [{ provide: ROOT_LOGGER, useValue: logger }],
      exports: [ROOT_LOGGER],
    };
  }
}
