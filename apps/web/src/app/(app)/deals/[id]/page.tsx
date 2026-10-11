import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { dealIdParamsSchema } from '@clientry/shared/deals';

import { DealView } from './_components/deal-view';
import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchDeal, prefetchDealHistory, prefetchStages } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'Deal' };

export default async function DealPage({ params }: PageProps<'/deals/[id]'>): Promise<ReactNode> {
  const parsed = dealIdParamsSchema.safeParse(await params);
  // A malformed id would only earn a 400 from the API.
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchDeal(queryClient, request, id),
    prefetchDealHistory(queryClient, request, id),
    prefetchStages(queryClient, request),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DealView id={id} />
    </HydrationBoundary>
  );
}
