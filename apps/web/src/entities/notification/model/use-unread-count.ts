import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { UnreadCountResponse } from '@clientry/shared/notifications';

import { notificationKeys } from './notification-keys';
import { fetchUnreadCount } from '../api/notification-api';

const POLL_INTERVAL_MS = 60_000;

// TanStack skips the interval while the tab is hidden; isPolling stops it for an idle user too,
// since every request checks the session in the database.
export function useUnreadCount(isPolling: boolean): UseQueryResult<UnreadCountResponse> {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: ({ signal }) => fetchUnreadCount(signal),
    refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
  });
}
