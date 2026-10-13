import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../infra/prisma/generated/client.js';

export interface TaskHandoverInput {
  readonly workspaceId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
}

// Runs in the caller's transaction, under the lock order of task edits and reminder delivery:
// the open tasks are locked before the membership they read is deleted.
@Injectable()
export class TaskHandover {
  async lockOpenTasks(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM tasks
      WHERE workspace_id = ${workspaceId}::uuid AND assignee_id = ${userId}::uuid
        AND done_at IS NULL
      FOR NO KEY UPDATE`;
  }

  // Every open task, deleted and hidden ones included; a pending reminder follows the new assignee,
  // since delivery reads the assignee when it runs. Raw SQL, so updated_at is set here.
  async handOpenTasksOver(
    tx: Prisma.TransactionClient,
    { workspaceId, fromUserId, toUserId }: TaskHandoverInput,
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE tasks SET assignee_id = ${toUserId}::uuid, updated_at = now()
      WHERE workspace_id = ${workspaceId}::uuid AND assignee_id = ${fromUserId}::uuid
        AND done_at IS NULL`;
  }
}
