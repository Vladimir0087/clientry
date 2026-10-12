import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import type { NotificationListResponse } from '@clientry/shared/notifications';

import { notificationKeys } from './notification-keys';
import { fetchNotifications } from '../api/notification-api';

export type NotificationListData = InfiniteData<NotificationListResponse, string | null>;

// Shared by the hook and by a fetch made while nothing shows the list.
export const notificationListOptions = infiniteQueryOptions<
  NotificationListResponse,
  Error,
  NotificationListData,
  typeof notificationKeys.list,
  string | null
>({
  queryKey: notificationKeys.list,
  queryFn: ({ pageParam, signal }) => fetchNotifications(pageParam, signal),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});

export function useNotifications(): UseInfiniteQueryResult<NotificationListData> {
  return useInfiniteQuery(notificationListOptions);
}
