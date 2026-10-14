import { Injectable } from '@nestjs/common';

import type { StageListItem } from '@clientry/shared/deals';

import { listWithCounts, PrismaLockedStagesRepository } from './prisma-locked-stages.repository.js';
import type { LockedStagesRepository, StagesRepository } from './stages.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';
import { ActivityLog } from '../activity/activity-log.repository.js';

@Injectable()
export class PrismaStagesRepository implements StagesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLog,
  ) {}

  listWithCounts(workspaceId: string): Promise<StageListItem[]> {
    return listWithCounts(this.prisma, workspaceId);
  }

  inWorkspaceLock<T>(
    workspaceId: string,
    work: (stages: LockedStagesRepository) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      return work(new PrismaLockedStagesRepository(tx, this.activityLog));
    });
  }
}
