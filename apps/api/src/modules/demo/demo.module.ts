import { Module } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { DemoResetService } from './demo-reset.service.js';
import { DEMO_QUEUE, DEMO_QUEUE_TOKEN, DemoResetWorker } from './demo-reset.worker.js';
import { DemoRepository } from './demo.repository.js';
import { PrismaDemoRepository } from './prisma-demo.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    DemoResetService,
    DemoResetWorker,
    { provide: DemoRepository, useClass: PrismaDemoRepository },
    {
      provide: DEMO_QUEUE_TOKEN,
      useFactory: (queues: QueueFactory): Queue => queues.createQueue(DEMO_QUEUE),
      inject: [QueueFactory],
    },
  ],
})
export class DemoModule {}
