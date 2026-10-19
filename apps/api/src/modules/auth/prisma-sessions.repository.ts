import { Injectable } from '@nestjs/common';

import type { MemberRole } from '@clientry/shared/auth';

import type {
  LiveSessionLookup,
  Membership,
  NewSession,
  SessionsRepository,
  StoredRefreshToken,
  TokenRotation,
} from './sessions.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

interface LiveMembershipRow {
  readonly workspace_id: string;
  readonly role: MemberRole;
  readonly is_demo: boolean;
}

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The membership is read FOR SHARE: a removal waits for the new session and revokes it with the
  // rest, or the session sees the member gone.
  createSession({ userId, expiresAt, tokenHash }: NewSession): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const memberships = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM memberships WHERE user_id = ${userId}::uuid FOR SHARE`;
      if (memberships.length === 0) {
        return null;
      }
      const session = await tx.session.create({
        data: { userId, expiresAt, refreshTokens: { create: { tokenHash } } },
        select: { id: true },
      });
      return session.id;
    });
  }

  // One statement: the membership with its workspace's demo flag and an EXISTS check on the
  // session's primary key. Prisma would load the workspace relation with a second query.
  async findLiveMembership({
    userId,
    sessionId,
    now,
  }: LiveSessionLookup): Promise<Membership | null> {
    const [row] = await this.prisma.$queryRaw<LiveMembershipRow[]>`
      SELECT m.workspace_id, m.role, w.is_demo
      FROM memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ${userId}::uuid
        AND EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = ${sessionId}::uuid AND s.user_id = m.user_id
            AND s.revoked_at IS NULL AND s.expires_at > ${now})`;
    return row ? { workspaceId: row.workspace_id, role: row.role, isDemo: row.is_demo } : null;
  }

  async deleteEndedSessions(userId: string, now: Date): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
  }

  async findToken(tokenHash: Uint8Array<ArrayBuffer>): Promise<StoredRefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        rotatedAt: true,
        session: { select: { userId: true, expiresAt: true, revokedAt: true } },
      },
    });
    if (!row) {
      return null;
    }
    const { session, ...token } = row;
    return {
      ...token,
      userId: session.userId,
      sessionExpiresAt: session.expiresAt,
      sessionRevokedAt: session.revokedAt,
    };
  }

  // The conditional update lets only one of two concurrent refreshes mark the token.
  async rotate({ tokenId, sessionId, rotatedAt, successorHash }: TokenRotation): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { id: tokenId, rotatedAt: null },
        data: { rotatedAt },
      }),
      this.prisma.refreshToken.create({
        data: { sessionId, tokenHash: successorHash },
        select: { id: true },
      }),
    ]);
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  // deleteMany takes no limit; a bounded statement keeps each delete's locks and WAL small.
  deleteExpired(now: Date, limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM sessions
      WHERE id IN (SELECT id FROM sessions WHERE expires_at <= ${now} LIMIT ${limit})`;
  }
}
