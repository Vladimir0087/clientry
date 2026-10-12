import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { EditDealForm } from '@/features/deal-form';
import { createQueryClient } from '@/shared/api/query-client';
import { dealIdParamsSchema } from '@clientry/shared/deals';

import { getPrefetchRequest } from '../../../_lib/access-session';
import { prefetchDeal, prefetchMembers } from '../../../_lib/prefetch';

export const metadata: Metadata = { title: 'Edit deal' };

export default async function EditDealPage({
  params,
}: PageProps<'/deals/[id]/edit'>): Promise<ReactNode> {
  const parsed = dealIdParamsSchema.safeParse(await params);
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchDeal(queryClient, request, id),
    prefetchMembers(queryClient, request),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditDealForm id={id} />
    </HydrationBoundary>
  );
}
