import type { Notification } from '@clientry/shared/notifications';

export interface NotificationText {
  readonly title: string;
  readonly taskId: string;
  // An instant; the reader's zone formats it.
  readonly dueAt: string;
}

export function describeNotification(notification: Notification): NotificationText {
  const { task, dueAt } = notification.payload;
  return { title: `Reminder: ${task.title}`, taskId: task.id, dueAt };
}
