import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Logger } from 'pino';

import { DemoResetService } from './demo-reset.service.js';
import { DemoRepository } from './demo.repository.js';
import { PrismaDemoRepository } from './prisma-demo.repository.js';
import type { AppConfig } from '../../infra/config/app-config.js';
import { AppConfigModule } from '../../infra/config/app-config.module.js';
import { AppLoggerModule } from '../../infra/logger/app-logger.module.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { PasswordHasher } from '../auth/password-hasher.js';

export interface DemoSeedModuleOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
}

// One reset for `prisma db seed`: DemoModule would start the worker, the queues and their clock.
@Module({})
export class DemoSeedModule {
  static forRoot({ config, logger }: DemoSeedModuleOptions): DynamicModule {
    return {
      module: DemoSeedModule,
      imports: [AppConfigModule.forRoot(config), AppLoggerModule.forRoot(logger), PrismaModule],
      providers: [
        DemoResetService,
        PasswordHasher,
        { provide: DemoRepository, useClass: PrismaDemoRepository },
      ],
    };
  }
}
