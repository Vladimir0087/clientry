import { Injectable } from '@nestjs/common';

import type { Member } from '@clientry/shared/workspaces';

import type {
  LockedMembersRepository,
  MembersOperation,
  MembersRepository,
} from './members.repository.js';
import {
  MEMBER_SELECT,
  PrismaLockedMembersRepository,
  toMember,
} from './prisma-locked-members.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { retryOnWriteConflict } from '../../infra/prisma/retry-on-write-conflict.js';
import { lockWorkspace } from '../../infra/prisma/workspace-lock.js';
import { SessionRevocation } from '../auth/session-revocation.repository.js';
import { DealHandover } from '../deals/deal-handover.repository.js';
import { TaskHandover } from '../tasks/task-handover.repository.js';

// A removal waits on the row locks of task edits and deliveries; Prisma's 5 s default would 500 it.
const LOCKED_WORK_TIMEOUT_MS = 15_000;

@Injectable()
export class PrismaMembersRepository implements MembersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealHandover,
    private readonly tasks: TaskHandover,
    private readonly sessions: SessionRevocation,
  ) {}

  async list(workspaceId: string): Promise<Member[]> {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: MEMBER_SELECT,
    });
    return rows.map(toMember);
  }

  inWorkspaceLock<T>(
    workspaceId: string,
    operation: MembersOperation,
    work: (members: LockedMembersRepository) => Promise<T>,
  ): Promise<T> {
    const writers = { deals: this.deals, tasks: this.tasks, sessions: this.sessions };
    // A task assigned to the member after its tasks were locked is locked after the membership,
    // against the order of reminder delivery; the rare deadlock that follows is retried.
    return retryOnWriteConflict(
      () =>
        this.prisma.$transaction(
          async (tx) => {
            await lockWorkspace(tx, workspaceId);
            return work(new PrismaLockedMembersRepository(tx, writers));
          },
          { timeout: LOCKED_WORK_TIMEOUT_MS },
        ),
      { operation, workspaceId },
    );
  }
}
