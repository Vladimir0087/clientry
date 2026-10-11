import { Module } from '@nestjs/common';

import { MembersController } from './members.controller.js';
import { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';
import { PrismaMembersRepository } from './prisma-members.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [MembersController],
  providers: [MembersService, { provide: MembersRepository, useClass: PrismaMembersRepository }],
})
export class WorkspacesModule {}
