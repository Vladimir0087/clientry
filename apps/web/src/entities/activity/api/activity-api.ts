import type { ApiPath } from '@/shared/api/api-path';
import { apiRequest } from '@/shared/api/browser-client';
import { activityFeedResponseSchema } from '@clientry/shared/activity';
import type { ActivityFeedResponse } from '@clientry/shared/activity';

export function activityFeedPath(cursor: string | null): ApiPath {
  return cursor === null
    ? '/api/activity'
    : `/api/activity?${new URLSearchParams({ cursor }).toString()}`;
}

export function fetchActivityFeed(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<ActivityFeedResponse> {
  return apiRequest(activityFeedPath(cursor), activityFeedResponseSchema, { signal });
}
