import { Injectable } from '@nestjs/common';

import { notificationSchema } from '@clientry/shared/notifications';
import type { Notification } from '@clientry/shared/notifications';

import type { NotificationCursor } from './notification-cursor.js';
import type {
  NotificationOwner,
  NotificationPage,
  NotificationPageRequest,
  NotificationsRepository,
} from './notifications.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  payload: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

// A stored row that does not parse fails the request with 500 rather than reaching the bell.
function toNotification(row: NotificationRow): Notification {
  const entry = {
    ...row,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  const result = notificationSchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`Notification ${row.id} does not match notificationSchema`, {
      cause: result.error,
    });
  }
  return result.data;
}

// Postgres cannot seek an index by the OR alone; the redundant bound starts the scan at the cursor.
function before(cursor: NotificationCursor | null): Prisma.NotificationWhereInput {
  if (cursor === null) {
    return {};
  }
  const createdAt = new Date(cursor.createdAt);
  return {
    createdAt: { lte: createdAt },
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
  };
}

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // One extra row tells whether a next page exists without counting.
  async list(
    { workspaceId, userId }: NotificationOwner,
    { after, limit }: NotificationPageRequest,
  ): Promise<NotificationPage> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, workspaceId, ...before(after) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: NOTIFICATION_SELECT,
    });
    return { items: rows.slice(0, limit).map(toNotification), hasMore: rows.length > limit };
  }

  async countUnread({ workspaceId, userId }: NotificationOwner, cap: number): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ readonly count: number }[]>`
      SELECT count(*)::int AS count FROM (
        SELECT 1 FROM notifications
        WHERE user_id = ${userId}::uuid AND read_at IS NULL
          AND workspace_id = ${workspaceId}::uuid
        LIMIT ${cap}
      ) unread`;
    return row?.count ?? 0;
  }

  // One statement: COALESCE keeps the first read time and still counts an already read row.
  async markRead(
    { workspaceId, userId }: NotificationOwner,
    id: string,
    now: Date,
  ): Promise<boolean> {
    const count = await this.prisma.$executeRaw`
      UPDATE notifications SET read_at = COALESCE(read_at, ${now})
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        AND workspace_id = ${workspaceId}::uuid`;
    return count > 0;
  }

  async markAllRead(
    { workspaceId, userId }: NotificationOwner,
    createdBefore: Date,
    now: Date,
  ): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, workspaceId, readAt: null, createdAt: { lte: createdBefore } },
      data: { readAt: now },
    });
  }
}
