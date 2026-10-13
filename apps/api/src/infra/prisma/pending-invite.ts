import type { Prisma } from './generated/client.js';

// Not used, not revoked, not expired: one rule for joining, the owner's list and revocation.
export function pendingInvite(now: Date): Prisma.InviteWhereInput {
  return { usedAt: null, revokedAt: null, expiresAt: { gt: now } };
}
