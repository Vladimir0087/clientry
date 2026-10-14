import { QueryObserver } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { activityKeys } from '@/entities/activity';
import { dashboardKeys } from '@/entities/dashboard';
import { createQueryClient } from '@/shared/api/query-client';

import { markDashboardStale } from './mark-dashboard-stale';

const SUMMARY_KEY = dashboardKeys.summary;
const FEED_KEY = activityKeys.feed;
const KEYS = [SUMMARY_KEY, FEED_KEY];

type TestQueryClient = ReturnType<typeof createQueryClient>;

interface CachedDashboard {
  readonly queryClient: TestQueryClient;
  readonly fetches: () => number;
}

// Open: an observer is subscribed, as on a mounted dashboard. Closed: the data only sits in cache.
async function cachedDashboard(isOpen: boolean): Promise<CachedDashboard> {
  const queryClient = createQueryClient({ onMutationSuccess: markDashboardStale });
  const queryFn = vi.fn().mockResolvedValue({});
  for (const queryKey of KEYS) {
    await cache(queryClient, queryKey, queryFn, isOpen);
  }
  return { queryClient, fetches: () => queryFn.mock.calls.length - KEYS.length };
}

async function cache(
  queryClient: TestQueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<unknown>,
  isOpen: boolean,
): Promise<void> {
  if (!isOpen) {
    await queryClient.query({ queryKey, queryFn });
    return;
  }
  const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity });
  onTestFinished(observer.subscribe(() => undefined));
  await vi.waitFor(() => {
    expect(queryClient.getQueryState(queryKey)?.status).toBe('success');
  });
}

async function runMutation(
  queryClient: TestQueryClient,
  mutationFn: () => Promise<unknown>,
): Promise<void> {
  await queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn })
    .execute(undefined)
    .catch(() => undefined);
  // A refetch the invalidation started would have called its queryFn by now.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('markDashboardStale', () => {
  it('should refetch the summary and the feed when a mutation succeeds while the dashboard is open', async () => {
    const { queryClient, fetches } = await cachedDashboard(true);

    await runMutation(queryClient, () => Promise.resolve('saved'));

    expect(fetches()).toBe(KEYS.length);
  });

  it('should leave the summary and the feed stale without refetching when a mutation succeeds while the dashboard is closed', async () => {
    const { queryClient, fetches } = await cachedDashboard(false);

    await runMutation(queryClient, () => Promise.resolve('saved'));

    expect(queryClient.getQueryState(SUMMARY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(FEED_KEY)?.isInvalidated).toBe(true);
    expect(fetches()).toBe(0);
  });

  it('should leave the summary and the feed fresh when a mutation fails', async () => {
    const { queryClient, fetches } = await cachedDashboard(true);

    await runMutation(queryClient, () => Promise.reject(new Error('failed')));

    expect(queryClient.getQueryState(SUMMARY_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(FEED_KEY)?.isInvalidated).toBe(false);
    expect(fetches()).toBe(0);
  });
});
