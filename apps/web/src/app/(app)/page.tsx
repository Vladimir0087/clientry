import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';

import { DashboardView } from './_components/dashboard-view';
import { getPrefetchRequest } from './_lib/access-session';
import { prefetchActivityFeed, prefetchDashboardSummary } from './_lib/prefetch';

export const metadata: Metadata = { title: 'Dashboard' };

// Closed deals are not prefetched: their bounds come from the reader's zone.
export default async function DashboardPage(): Promise<ReactNode> {
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchDashboardSummary(queryClient, request),
    prefetchActivityFeed(queryClient, request),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView />
    </HydrationBoundary>
  );
}
