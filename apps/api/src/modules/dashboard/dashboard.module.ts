import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';
import { PrismaDashboardRepository } from './prisma-dashboard.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

// Reads deals, tasks and members of other modules through the shared visibility rules.
@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    { provide: DashboardRepository, useClass: PrismaDashboardRepository },
  ],
})
export class DashboardModule {}
