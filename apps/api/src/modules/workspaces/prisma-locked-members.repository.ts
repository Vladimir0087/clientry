import type { MemberRole } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

import { findCallerRole } from './caller-role.repository.js';
import type { LockedMembersRepository, MemberHandover } from './members.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';
import { pendingInvite } from '../../infra/prisma/pending-invite.js';
import type { SessionRevocation } from '../auth/session-revocation.repository.js';
import type { DealHandover } from '../deals/deal-handover.repository.js';
import type { TaskHandover } from '../tasks/task-handover.repository.js';

export const MEMBER_SELECT = {
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MembershipSelect;

type MemberRow = Prisma.MembershipGetPayload<{ select: typeof MEMBER_SELECT }>;

export function toMember({ role, createdAt, user }: MemberRow): Member {
  return { ...user, role, joinedAt: createdAt.toISOString() };
}

export interface MemberWriters {
  readonly deals: DealHandover;
  readonly tasks: TaskHandover;
  readonly sessions: SessionRevocation;
}

// Deals, tasks and sessions are written through the providers their modules export.
export class PrismaLockedMembersRepository implements LockedMembersRepository {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly writers: MemberWriters,
  ) {}

  findRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    return findCallerRole(this.tx, workspaceId, userId);
  }

  async findMember(workspaceId: string, userId: string): Promise<Member | null> {
    const row = await this.tx.membership.findFirst({
      where: { workspaceId, userId },
      select: MEMBER_SELECT,
    });
    return row ? toMember(row) : null;
  }

  countOwners(workspaceId: string): Promise<number> {
    return this.tx.membership.count({ where: { workspaceId, role: 'owner' } });
  }

  async updateRole(workspaceId: string, userId: string, role: MemberRole): Promise<Member> {
    const row = await this.tx.membership.update({
      where: { userId, workspaceId },
      data: { role },
      select: MEMBER_SELECT,
    });
    return toMember(row);
  }

  lockOpenTasks(workspaceId: string, userId: string): Promise<void> {
    return this.writers.tasks.lockOpenTasks(this.tx, workspaceId, userId);
  }

  async deleteMembership(workspaceId: string, userId: string): Promise<void> {
    await this.tx.membership.deleteMany({ where: { workspaceId, userId } });
  }

  handOverDeals(
    workspaceId: string,
    { actorId, member, receiver }: MemberHandover,
  ): Promise<number> {
    return this.writers.deals.handOpenDealsOver(this.tx, {
      workspaceId,
      actorId,
      from: member,
      to: receiver,
    });
  }

  handOverTasks(workspaceId: string, { member, receiver }: MemberHandover): Promise<number> {
    return this.writers.tasks.handOpenTasksOver(this.tx, {
      workspaceId,
      fromUserId: member.id,
      toUserId: receiver.id,
    });
  }

  revokeSessions(userId: string, now: Date): Promise<number> {
    return this.writers.sessions.revokeUserSessions(this.tx, userId, now);
  }

  async revokePendingInvitesCreatedBy(
    workspaceId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.tx.invite.updateMany({
      where: { workspaceId, createdById: userId, ...pendingInvite(now) },
      data: { revokedAt: now },
    });
  }
}
