import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

import {
  markAllNotificationsRead,
  markNotificationRead,
  markReadInCache,
  notificationKeys,
} from '@/entities/notification';
import { hasQueryData } from '@/shared/api/has-query-data';
import type { Notification } from '@clientry/shared/notifications';

interface MarkContext {
  readonly hasCancelledList: boolean;
}

// The cache changes at once and survives the cancel; a fetch begun before the mark would bring
// the entries back unread, so a cancelled list is fetched again once the mark is stored.
async function markInCache(
  queryClient: QueryClient,
  isMarked: (notification: Notification) => boolean,
  countAfter?: number,
): Promise<MarkContext> {
  const list = { queryKey: notificationKeys.list, predicate: hasQueryData };
  const hasCancelledList = queryClient.isFetching(list) > 0;
  markReadInCache(queryClient, isMarked, countAfter);
  await Promise.all([
    queryClient.cancelQueries(list),
    queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount, predicate: hasQueryData }),
  ]);
  return { hasCancelledList };
}

// The server's count follows every mark; the list only after a failure or a cancelled fetch.
function refetchAfterMark(
  queryClient: QueryClient,
  error: Error | null,
  context: MarkContext | undefined,
): void {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
  if (error !== null || context?.hasCancelledList === true) {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.list });
  }
}

export function useMarkRead(): UseMutationResult<void, Error, string, MarkContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => markInCache(queryClient, (notification) => notification.id === id),
    onSettled: (_result, error, _id, context) => {
      refetchAfterMark(queryClient, error, context);
    },
  });
}

// before is the newest entry the user has seen; one arriving meanwhile stays unread.
export function useMarkAllRead(): UseMutationResult<void, Error, string, MarkContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (before: string) => markAllNotificationsRead(before),
    onMutate: (before) => {
      const limit = Date.parse(before);
      return markInCache(
        queryClient,
        (notification) => Date.parse(notification.createdAt) <= limit,
        0,
      );
    },
    onSettled: (_result, error, _before, context) => {
      refetchAfterMark(queryClient, error, context);
    },
  });
}
