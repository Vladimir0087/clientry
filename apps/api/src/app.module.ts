import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import type { Logger } from 'pino';

import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { TrustedOriginGuard } from './common/guards/trusted-origin.guard.js';
import { StrictSchemaSerializerInterceptor } from './common/interceptors/strict-schema-serializer.interceptor.js';
import { createValidationPipe } from './common/pipes/create-validation-pipe.js';
import type { AppConfig } from './infra/config/app-config.js';
import { AppConfigModule } from './infra/config/app-config.module.js';
import { AppLoggerModule } from './infra/logger/app-logger.module.js';
import { AccessTokenGuard } from './modules/auth/access-token.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RolesGuard } from './modules/auth/roles.guard.js';
import { HealthModule } from './modules/health/health.module.js';

export interface AppModuleOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
}

@Module({})
export class AppModule {
  static forRoot({ config, logger }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        AppLoggerModule.forRoot(logger),
        AuthModule,
        HealthModule,
      ],
      providers: [
        // Global guards run in this order: CSRF check, authentication, role.
        { provide: APP_GUARD, useClass: TrustedOriginGuard },
        { provide: APP_GUARD, useExisting: AccessTokenGuard },
        { provide: APP_GUARD, useExisting: RolesGuard },
        { provide: APP_PIPE, useFactory: createValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: StrictSchemaSerializerInterceptor },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
