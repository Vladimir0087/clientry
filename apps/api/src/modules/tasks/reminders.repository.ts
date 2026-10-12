import type { NotificationEvent } from '@clientry/shared/notifications';
import type { Task } from '@clientry/shared/tasks';

import type { PendingReminder } from './reminder-queue.js';
import type { ReminderWindow } from './reminder-window.js';

export interface NewNotification {
  readonly workspaceId: string;
  readonly userId: string;
  readonly taskId: string;
  readonly event: NotificationEvent;
}

export interface RemindersTransaction {
  // Locks the task row until the transaction ends; null unless the task is visible.
  findTask(workspaceId: string, taskId: string): Promise<Task | null>;
  // Reads the membership FOR SHARE: removing the member waits for the delivery or is seen.
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  markSent(workspaceId: string, taskId: string, sentAt: Date): Promise<void>;
  insertNotification(notification: NewNotification): Promise<void>;
}

export abstract class RemindersRepository {
  // The one read across workspaces: unsent reminders of open visible tasks inside the window.
  abstract findPending(window: ReminderWindow): Promise<PendingReminder[]>;
  abstract inTransaction<T>(work: (reminders: RemindersTransaction) => Promise<T>): Promise<T>;
}
