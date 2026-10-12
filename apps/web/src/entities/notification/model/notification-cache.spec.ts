import { describe, expect, it } from 'vitest';

import { createQueryClient } from '@/shared/api/query-client';

import { markReadInCache } from './notification-cache';
import { notificationKeys } from './notification-keys';
import type { NotificationListData } from './use-notifications';
import { makeNotification, makeNotificationPage } from '../../../../test/notifications';

const UNREAD = makeNotification(3);
const READ = makeNotification(2, { readAt: '2026-10-15T07:00:00.000Z' });

function listOf(...items: Parameters<typeof makeNotificationPage>[0]): NotificationListData {
  return { pages: [makeNotificationPage(items)], pageParams: [null] };
}

describe('markReadInCache', () => {
  it('should mark the entry read and lower the count when the list holds it unread', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(notificationKeys.list, listOf(UNREAD, READ));
    queryClient.setQueryData(notificationKeys.unreadCount, { count: 1 });

    markReadInCache(queryClient, (notification) => notification.id === UNREAD.id);

    const list = queryClient.getQueryData<NotificationListData>(notificationKeys.list);
    expect(list?.pages[0]?.items[0]?.readAt).not.toBeNull();
    expect(queryClient.getQueryData(notificationKeys.unreadCount)).toEqual({ count: 0 });
  });

  it('should leave the list stale when it holds nothing to mark', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(notificationKeys.list, listOf(READ));
    await queryClient.invalidateQueries({ queryKey: notificationKeys.list, refetchType: 'none' });

    markReadInCache(queryClient, (notification) => notification.id === UNREAD.id);

    expect(queryClient.getQueryState(notificationKeys.list)?.isInvalidated).toBe(true);
  });
});
