import { usePathname, useRouter } from 'next/navigation';

import { taskPath } from '@/entities/task';
import { focusPageHeading, requestHeadingFocus } from '@/shared/lib/heading-focus';
import type { Notification } from '@clientry/shared/notifications';

import { useMarkRead } from './use-mark-read';

export type FollowNotification = (notification: Notification, isOpeningHere: boolean) => void;

// Following the notification of the task in view changes no route, so no heading mounts.
export function useTaskShownCheck(): (notification: Notification) => boolean {
  const pathname = usePathname();
  return (notification) => pathname === taskPath(notification.payload.task.id);
}

// Marks the entry read; a task opening on a new page in this tab takes the heading focus there.
export function useFollowNotification(): FollowNotification {
  const markRead = useMarkRead();
  const isTaskShown = useTaskShownCheck();
  return (notification, isOpeningHere) => {
    if (notification.readAt === null) {
      markRead.mutate(notification.id);
    }
    if (isOpeningHere && !isTaskShown(notification)) {
      requestHeadingFocus();
    }
  };
}

// For a place without a link, such as a toast's button.
export function useOpenNotification(): (notification: Notification) => void {
  const router = useRouter();
  const follow = useFollowNotification();
  const isTaskShown = useTaskShownCheck();
  return (notification) => {
    follow(notification, true);
    if (isTaskShown(notification)) {
      focusPageHeading();
      return;
    }
    router.push(taskPath(notification.payload.task.id));
  };
}
