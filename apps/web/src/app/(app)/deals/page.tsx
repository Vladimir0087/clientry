import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { loadBoardFilters } from '@/features/deal-filters';
import { createQueryClient } from '@/shared/api/query-client';

import { BoardView } from './_components/board-view';
import { getPrefetchRequest } from '../_lib/access-session';
import { prefetchBoard } from '../_lib/prefetch';

export const metadata: Metadata = { title: 'Deals' };

export default async function DealsPage({ searchParams }: PageProps<'/deals'>): Promise<ReactNode> {
  const filters = await loadBoardFilters(searchParams);
  const queryClient = createQueryClient();
  await prefetchBoard(queryClient, await getPrefetchRequest(), filters);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BoardView />
    </HydrationBoundary>
  );
}
