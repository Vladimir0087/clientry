import { Injectable } from '@nestjs/common';

import type {
  LiveSessionLookup,
  Membership,
  NewSession,
  SessionsRepository,
  StoredRefreshToken,
  TokenRotation,
} from './sessions.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession({ userId, expiresAt, tokenHash }: NewSession): Promise<string> {
    const session = await this.prisma.session.create({
      data: { userId, expiresAt, refreshTokens: { create: { tokenHash } } },
      select: { id: true },
    });
    return session.id;
  }

  // One statement: the membership row with an EXISTS check on the session's primary key.
  findLiveMembership({ userId, sessionId, now }: LiveSessionLookup): Promise<Membership | null> {
    return this.prisma.membership.findFirst({
      where: {
        userId,
        user: { sessions: { some: { id: sessionId, revokedAt: null, expiresAt: { gt: now } } } },
      },
      select: { workspaceId: true, role: true },
    });
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
}
