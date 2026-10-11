import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';

import { StagesView } from './_components/stages-view';
import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchStages } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'Stages' };

export default async function StagesPage(): Promise<ReactNode> {
  const queryClient = createQueryClient();
  await prefetchStages(queryClient, await getPrefetchRequest());
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StagesView />
    </HydrationBoundary>
  );
}
