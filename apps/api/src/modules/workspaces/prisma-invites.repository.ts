import { Injectable } from '@nestjs/common';

import type { InviteSummary } from '@clientry/shared/workspaces';

import type { InvitesRepository, LockedInvitesRepository } from './invites.repository.js';
import {
  INVITE_SELECT,
  pending,
  PrismaLockedInvitesRepository,
  toSummary,
} from './prisma-locked-invites.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';

@Injectable()
export class PrismaInvitesRepository implements InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(workspaceId: string, now: Date): Promise<InviteSummary[]> {
    const rows = await this.prisma.invite.findMany({
      where: pending(workspaceId, now),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: INVITE_SELECT,
    });
    return rows.map(toSummary);
  }

  inWorkspaceLock<T>(
    workspaceId: string,
    work: (invites: LockedInvitesRepository) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      return work(new PrismaLockedInvitesRepository(tx));
    });
  }
}
