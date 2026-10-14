import { Module } from '@nestjs/common';

import { ClientsController } from './clients.controller.js';
import { ClientsRepository } from './clients.repository.js';
import { ClientsService } from './clients.service.js';
import { PrismaClientsRepository } from './prisma-clients.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { ActivityModule } from '../activity/activity.module.js';

@Module({
  imports: [PrismaModule, ActivityModule],
  controllers: [ClientsController],
  providers: [ClientsService, { provide: ClientsRepository, useClass: PrismaClientsRepository }],
})
export class ClientsModule {}
