import { Module } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { BullmqReminderQueue } from './bullmq-reminder-queue.js';
import { PrismaRemindersRepository } from './prisma-reminders.repository.js';
import { PrismaTasksRepository } from './prisma-tasks.repository.js';
import { REMINDERS_QUEUE, REMINDERS_QUEUE_TOKEN } from './reminder-jobs.js';
import { ReminderQueue } from './reminder-queue.js';
import { RemindersRepository } from './reminders.repository.js';
import { RemindersService } from './reminders.service.js';
import { RemindersWorker } from './reminders.worker.js';
import { TaskHandover } from './task-handover.repository.js';
import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';
import { ActivityModule } from '../activity/activity.module.js';

@Module({
  imports: [PrismaModule, ActivityModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    RemindersService,
    RemindersWorker,
    TaskHandover,
    { provide: TasksRepository, useClass: PrismaTasksRepository },
    { provide: RemindersRepository, useClass: PrismaRemindersRepository },
    { provide: ReminderQueue, useClass: BullmqReminderQueue },
    {
      provide: REMINDERS_QUEUE_TOKEN,
      useFactory: (queues: QueueFactory): Queue => queues.createQueue(REMINDERS_QUEUE),
      inject: [QueueFactory],
    },
  ],
  exports: [TaskHandover],
})
export class TasksModule {}
