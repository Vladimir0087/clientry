import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../infra/prisma/generated/client.js';

// Runs in the caller's transaction, so a member's removal and the end of their sessions commit
// together.
@Injectable()
export class SessionRevocation {
  // Returns how many sessions were not revoked yet, ended ones included.
  revokeUserSessions(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<number> {
    return tx.$executeRaw`
      UPDATE sessions SET revoked_at = ${now}
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
  }
}
