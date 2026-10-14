import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import type { ActivityFeedResponse } from '@clientry/shared/activity';

import { activityKeys } from './activity-keys';
import { fetchActivityFeed } from '../api/activity-api';

export type ActivityFeedData = InfiniteData<ActivityFeedResponse, string | null>;

export function useActivityFeed(): UseInfiniteQueryResult<ActivityFeedData> {
  return useInfiniteQuery({
    queryKey: activityKeys.feed,
    queryFn: ({ pageParam, signal }) => fetchActivityFeed(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
