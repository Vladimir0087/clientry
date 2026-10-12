import { notificationEventSchema } from '@clientry/shared/notifications';
import type { Task } from '@clientry/shared/tasks';

import type { NewNotification, RemindersTransaction } from './reminders.repository.js';
import { findLockedTask } from './task-reads.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';

export class PrismaRemindersTransaction implements RemindersTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findTask(workspaceId: string, taskId: string): Promise<Task | null> {
    return findLockedTask(this.tx, workspaceId, taskId);
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const rows = await this.tx.$queryRaw<unknown[]>`
      SELECT 1 FROM memberships
      WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
      FOR SHARE`;
    return rows.length > 0;
  }

  // Raw SQL leaves updated_at alone: a delivery is not an edit of the task.
  async markSent(workspaceId: string, taskId: string, sentAt: Date): Promise<void> {
    await this.tx.$executeRaw`
      UPDATE tasks SET reminder_sent_at = ${sentAt}
      WHERE id = ${taskId}::uuid AND workspace_id = ${workspaceId}::uuid`;
  }

  async insertNotification({ workspaceId, userId, taskId, event }: NewNotification): Promise<void> {
    const { type, payload } = notificationEventSchema.parse(event);
    await this.tx.notification.create({
      data: { workspaceId, userId, taskId, type, payload },
      select: { id: true },
    });
  }
}
