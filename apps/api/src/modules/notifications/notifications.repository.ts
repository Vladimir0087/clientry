import type { Notification } from '@clientry/shared/notifications';

import type { CreatedAtCursor } from '../../common/pagination/created-at-cursor.js';

// Every method reads or writes only the notifications of one user in one workspace.
export interface NotificationOwner {
  readonly workspaceId: string;
  readonly userId: string;
}

export interface NotificationPageRequest {
  readonly after: CreatedAtCursor | null;
  readonly limit: number;
}

export interface NotificationPage {
  readonly items: readonly Notification[];
  readonly hasMore: boolean;
}

export abstract class NotificationsRepository {
  // Newest first: created_at, then id, descending.
  abstract list(owner: NotificationOwner, page: NotificationPageRequest): Promise<NotificationPage>;
  // Counts at most cap unread notifications, so the cost stays the same however many pile up.
  abstract countUnread(owner: NotificationOwner, cap: number): Promise<number>;
  // Keeps the first read time; false when the user has no such notification.
  abstract markRead(owner: NotificationOwner, id: string, now: Date): Promise<boolean>;
  // Marks the unread ones created at or before the moment.
  abstract markAllRead(owner: NotificationOwner, before: Date, now: Date): Promise<void>;
}
