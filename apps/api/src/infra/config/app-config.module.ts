import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AppConfig } from './app-config.js';

@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: AppConfig, useValue: config }],
      exports: [AppConfig],
    };
  }
}
