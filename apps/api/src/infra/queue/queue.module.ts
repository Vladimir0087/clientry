import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { JobsSettings } from './jobs-settings.js';
import { QueueFactory } from './queue-factory.js';
import { RecurringJobs } from './recurring-jobs.js';

export interface QueueModuleOptions {
  readonly shouldRunJobs: boolean;
}

@Module({})
export class QueueModule {
  static forRoot({ shouldRunJobs }: QueueModuleOptions): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      providers: [
        { provide: JobsSettings, useValue: new JobsSettings(shouldRunJobs) },
        QueueFactory,
        RecurringJobs,
      ],
      exports: [QueueFactory, RecurringJobs],
    };
  }
}
