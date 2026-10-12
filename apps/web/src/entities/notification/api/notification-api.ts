import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from '@clientry/shared/notifications';
import type { NotificationListResponse, UnreadCountResponse } from '@clientry/shared/notifications';

const UNREAD_COUNT_PATH = '/api/notifications/unread-count';

export function fetchNotifications(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<NotificationListResponse> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor }).toString()}`;
  return apiRequest(`/api/notifications${query}`, notificationListResponseSchema, { signal });
}

export function fetchUnreadCount(signal?: AbortSignal): Promise<UnreadCountResponse> {
  return apiRequest(UNREAD_COUNT_PATH, unreadCountResponseSchema, { signal });
}

export function markNotificationRead(id: string): Promise<void> {
  return apiRequest(`/api/notifications/${id}/read`, z.undefined(), { method: 'POST' });
}

export function markAllNotificationsRead(before: string): Promise<void> {
  return apiRequest('/api/notifications/read-all', z.undefined(), {
    method: 'POST',
    body: { before },
  });
}
