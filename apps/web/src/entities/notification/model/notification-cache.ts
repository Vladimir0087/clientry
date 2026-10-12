import type { QueryClient } from '@tanstack/react-query';

import type { Notification, UnreadCountResponse } from '@clientry/shared/notifications';

import { notificationKeys } from './notification-keys';
import type { NotificationListData } from './use-notifications';

// Marks the matching unread entries read in the cached list; the count follows, by the number
// marked or to the given value, until its refetch.
export function markReadInCache(
  queryClient: QueryClient,
  isMarked: (notification: Notification) => boolean,
  countAfter?: number,
): void {
  const readAt = new Date().toISOString();
  let markedCount = 0;
  const markEntry = (notification: Notification): Notification => {
    if (notification.readAt !== null || !isMarked(notification)) {
      return notification;
    }
    markedCount += 1;
    return { ...notification, readAt };
  };
  // A write marks the list fresh, so a list with nothing to mark is left as it is.
  queryClient.setQueryData<NotificationListData>(notificationKeys.list, (data) => {
    if (data === undefined) {
      return undefined;
    }
    const pages = data.pages.map((page) => ({ ...page, items: page.items.map(markEntry) }));
    return markedCount === 0 ? undefined : { ...data, pages };
  });
  queryClient.setQueryData<UnreadCountResponse>(notificationKeys.unreadCount, (data) =>
    data === undefined ? data : { count: countAfter ?? Math.max(0, data.count - markedCount) },
  );
}
