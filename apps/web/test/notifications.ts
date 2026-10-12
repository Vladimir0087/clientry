import { notificationListResponseSchema, notificationSchema } from '@clientry/shared/notifications';
import type { Notification, NotificationListResponse } from '@clientry/shared/notifications';

import { makeTask } from './tasks';

function notificationId(index: number): string {
  return `0199c3b0-1a2b-7c3d-8e4f-${String(index).padStart(12, '0')}`;
}

// Newer entries get higher indexes, a minute apart.
export function makeNotification(
  index: number,
  overrides: Partial<Notification> = {},
): Notification {
  const task = makeTask(index);
  return notificationSchema.parse({
    id: notificationId(index),
    type: 'task_reminder',
    payload: { task: { id: task.id, title: task.title }, dueAt: task.dueAt },
    readAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 15, 6, index)).toISOString(),
    ...overrides,
  });
}

export function makeNotificationPage(
  items: readonly Notification[],
  nextCursor: string | null = null,
): NotificationListResponse {
  return notificationListResponseSchema.parse({ items, nextCursor });
}
