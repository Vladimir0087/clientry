import { Injectable } from '@nestjs/common';

import { NOTIFICATION_LIMITS } from '@clientry/shared/notifications';
import type {
  MarkAllReadRequest,
  Notification,
  NotificationListQuery,
  NotificationListResponse,
  UnreadCountResponse,
} from '@clientry/shared/notifications';

import { NotificationNotFoundError } from './errors.js';
import { NotificationsRepository } from './notifications.repository.js';
import type { NotificationOwner } from './notifications.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';
import {
  decodeCreatedAtCursor,
  encodeCreatedAtCursor,
} from '../../common/pagination/created-at-cursor.js';
import type { CreatedAtCursor } from '../../common/pagination/created-at-cursor.js';

function ownerOf(user: AuthUser): NotificationOwner {
  return { workspaceId: user.workspaceId, userId: user.id };
}

function decodeCursor(raw: string | undefined): CreatedAtCursor | null {
  if (raw === undefined) {
    return null;
  }
  const cursor = decodeCreatedAtCursor(raw);
  if (!cursor) {
    throw new RequestValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
  }
  return cursor;
}

function cursorAfter({ createdAt, id }: Notification): string {
  return encodeCreatedAtCursor({ createdAt, id });
}

// Reminder delivery in the tasks module writes notifications; this module reads and marks them.
@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationsRepository) {}

  async list(user: AuthUser, query: NotificationListQuery): Promise<NotificationListResponse> {
    const page = await this.notifications.list(ownerOf(user), {
      after: decodeCursor(query.cursor),
      limit: query.limit,
    });
    const last = page.items.at(-1);
    return {
      items: [...page.items],
      nextCursor: page.hasMore && last ? cursorAfter(last) : null,
    };
  }

  async unreadCount(user: AuthUser): Promise<UnreadCountResponse> {
    const count = await this.notifications.countUnread(
      ownerOf(user),
      NOTIFICATION_LIMITS.unreadCountCap,
    );
    return { count };
  }

  // Idempotent: a read notification keeps its first read time.
  async markRead(user: AuthUser, id: string): Promise<void> {
    if (!(await this.notifications.markRead(ownerOf(user), id, new Date()))) {
      throw new NotificationNotFoundError();
    }
  }

  // before is the newest notification the user has seen, so one arriving meanwhile stays unread.
  async markAllRead(user: AuthUser, { before }: MarkAllReadRequest): Promise<void> {
    await this.notifications.markAllRead(ownerOf(user), new Date(before), new Date());
  }
}
