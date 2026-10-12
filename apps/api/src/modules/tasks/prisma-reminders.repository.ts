import { Injectable } from '@nestjs/common';

import { PrismaRemindersTransaction } from './prisma-reminders-transaction.repository.js';
import type { PendingReminder } from './reminder-queue.js';
import type { ReminderWindow } from './reminder-window.js';
import type { RemindersRepository, RemindersTransaction } from './reminders.repository.js';
import { TASK_LINK_JOINS, TASK_LINKS_VISIBLE } from './task-reads.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

interface PendingRow {
  readonly workspace_id: string;
  readonly task_id: string;
  readonly remind_at: Date;
}

@Injectable()
export class PrismaRemindersRepository implements RemindersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The window bounds the remind_at index scan on both sides, so sent reminders never pile up in it.
  async findPending({ from, to }: ReminderWindow): Promise<PendingReminder[]> {
    const rows = await this.prisma.$queryRaw<PendingRow[]>`
      SELECT t.workspace_id, t.id AS task_id, t.remind_at
      FROM tasks t
      ${TASK_LINK_JOINS}
      WHERE t.remind_at >= ${from} AND t.remind_at <= ${to}
        AND t.reminder_sent_at IS NULL AND t.done_at IS NULL AND t.deleted_at IS NULL
        AND ${TASK_LINKS_VISIBLE}`;
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      remindAt: row.remind_at.toISOString(),
    }));
  }

  inTransaction<T>(work: (reminders: RemindersTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaRemindersTransaction(tx)));
  }
}
