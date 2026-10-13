import type { MemberRole } from '@clientry/shared/auth';

import type { Prisma } from '../../infra/prisma/generated/client.js';

// Null when the user is no longer a member of the workspace.
export async function findCallerRole(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<MemberRole | null> {
  const row = await tx.membership.findFirst({
    where: { workspaceId, userId },
    select: { role: true },
  });
  return row?.role ?? null;
}
