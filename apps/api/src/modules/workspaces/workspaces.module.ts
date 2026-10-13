import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';

import { InvitesController } from './invites.controller.js';
import { InvitesRepository } from './invites.repository.js';
import { InvitesService } from './invites.service.js';
import { MembersController } from './members.controller.js';
import { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';
import { PrismaInvitesRepository } from './prisma-invites.repository.js';
import { PrismaMembersRepository } from './prisma-members.repository.js';
import { PrismaWorkspaceRepository } from './prisma-workspace.repository.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceRepository } from './workspace.repository.js';
import { WorkspaceService } from './workspace.service.js';
import { noStore } from '../../common/http/no-store.middleware.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DealsModule } from '../deals/deals.module.js';
import { TasksModule } from '../tasks/tasks.module.js';

// Deals, tasks and sessions change on a removal only through the providers these modules export.
@Module({
  imports: [PrismaModule, AuthModule, DealsModule, TasksModule],
  controllers: [MembersController, InvitesController, WorkspaceController],
  providers: [
    MembersService,
    InvitesService,
    WorkspaceService,
    { provide: MembersRepository, useClass: PrismaMembersRepository },
    { provide: InvitesRepository, useClass: PrismaInvitesRepository },
    { provide: WorkspaceRepository, useClass: PrismaWorkspaceRepository },
  ],
})
export class WorkspacesModule implements NestModule {
  // The create response holds a live token.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(noStore).forRoutes(InvitesController);
  }
}
