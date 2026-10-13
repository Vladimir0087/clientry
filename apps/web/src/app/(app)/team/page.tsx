import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';

import { TeamView } from './_components/team-view';
import { getPrefetchRequest } from '../_lib/access-session';
import { prefetchMembers } from '../_lib/prefetch';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage(): Promise<ReactNode> {
  const queryClient = createQueryClient();
  await prefetchMembers(queryClient, await getPrefetchRequest());
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TeamView />
    </HydrationBoundary>
  );
}
