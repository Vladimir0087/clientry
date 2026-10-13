import { Module } from '@nestjs/common';

import { DealHandover } from './deal-handover.repository.js';
import { DealMovesService } from './deal-moves.service.js';
import { DealsController } from './deals.controller.js';
import { DealsRepository } from './deals.repository.js';
import { DealsService } from './deals.service.js';
import { PrismaDealsRepository } from './prisma-deals.repository.js';
import { PrismaStagesRepository } from './prisma-stages.repository.js';
import { StagesController } from './stages.controller.js';
import { StagesRepository } from './stages.repository.js';
import { StagesService } from './stages.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [DealsController, StagesController],
  providers: [
    DealsService,
    DealMovesService,
    StagesService,
    DealHandover,
    { provide: DealsRepository, useClass: PrismaDealsRepository },
    { provide: StagesRepository, useClass: PrismaStagesRepository },
  ],
  exports: [DealHandover],
})
export class DealsModule {}
