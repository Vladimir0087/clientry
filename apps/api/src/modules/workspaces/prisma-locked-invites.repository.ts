import type { MemberRole } from '@clientry/shared/auth';
import type { InviteSummary } from '@clientry/shared/workspaces';

import { findCallerRole } from './caller-role.repository.js';
import type { LockedInvitesRepository, NewInvite } from './invites.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';
import { pendingInvite } from '../../infra/prisma/pending-invite.js';

export const INVITE_SELECT = {
  id: true,
  createdAt: true,
  expiresAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InviteSelect;

type InviteRow = Prisma.InviteGetPayload<{ select: typeof INVITE_SELECT }>;

export function toSummary(row: InviteRow): InviteSummary {
  return {
    id: row.id,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function pending(workspaceId: string, now: Date): Prisma.InviteWhereInput {
  return { workspaceId, ...pendingInvite(now) };
}

export class PrismaLockedInvitesRepository implements LockedInvitesRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    return findCallerRole(this.tx, workspaceId, userId);
  }

  countPending(workspaceId: string, now: Date): Promise<number> {
    return this.tx.invite.count({ where: pending(workspaceId, now) });
  }

  async create(
    workspaceId: string,
    { createdById, tokenHash, expiresAt }: NewInvite,
  ): Promise<InviteSummary> {
    const row = await this.tx.invite.create({
      data: { workspaceId, createdById, tokenHash, expiresAt },
      select: INVITE_SELECT,
    });
    return toSummary(row);
  }

  async revoke(workspaceId: string, id: string, now: Date): Promise<boolean> {
    const { count } = await this.tx.invite.updateMany({
      where: { id, ...pending(workspaceId, now) },
      data: { revokedAt: now },
    });
    return count > 0;
  }
}
