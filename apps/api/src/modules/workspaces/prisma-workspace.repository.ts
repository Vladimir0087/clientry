import { Injectable } from '@nestjs/common';

import { PrismaLockedWorkspaceRepository } from './prisma-locked-workspace.repository.js';
import type { LockedWorkspaceRepository, WorkspaceRepository } from './workspace.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';

@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  inWorkspaceLock<T>(
    workspaceId: string,
    work: (workspace: LockedWorkspaceRepository) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      return work(new PrismaLockedWorkspaceRepository(tx));
    });
  }
}
