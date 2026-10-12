import type { Prisma } from './generated/client.js';

// Serializes writes that check rules across a workspace's rows, such as unique stage names.
// NO KEY UPDATE: inserts' foreign key checks take KEY SHARE here, which UPDATE would block.
export async function lockWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR NO KEY UPDATE`;
}
