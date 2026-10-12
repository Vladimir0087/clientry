import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { PrismaNotificationsRepository } from './prisma-notifications.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NotificationsRepository, useClass: PrismaNotificationsRepository },
  ],
})
export class NotificationsModule {}
