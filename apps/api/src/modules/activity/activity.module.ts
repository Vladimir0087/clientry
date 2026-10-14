import { Module } from '@nestjs/common';

import { ActivityLog } from './activity-log.repository.js';
import { ActivityController } from './activity.controller.js';
import { ActivityRepository } from './activity.repository.js';
import { ActivityService } from './activity.service.js';
import { PrismaActivityRepository } from './prisma-activity.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

// Deals, clients and tasks write their entries only through the exported ActivityLog.
@Module({
  imports: [PrismaModule],
  controllers: [ActivityController],
  providers: [
    ActivityLog,
    ActivityService,
    { provide: ActivityRepository, useClass: PrismaActivityRepository },
  ],
  exports: [ActivityLog],
})
export class ActivityModule {}
