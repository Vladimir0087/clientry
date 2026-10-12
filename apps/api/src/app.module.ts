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
import { QueueModule } from './infra/queue/queue.module.js';
import { AccessTokenGuard } from './modules/auth/access-token.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RolesGuard } from './modules/auth/roles.guard.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { DealsModule } from './modules/deals/deals.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';

export interface AppModuleOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
  // Workers and the recurring jobs clock; queues exist either way, so writes still add jobs.
  readonly shouldRunJobs: boolean;
}

@Module({})
export class AppModule {
  static forRoot({ config, logger, shouldRunJobs }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        AppLoggerModule.forRoot(logger),
        QueueModule.forRoot({ shouldRunJobs }),
        AuthModule,
        ClientsModule,
        DealsModule,
        HealthModule,
        NotificationsModule,
        TasksModule,
        WorkspacesModule,
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
