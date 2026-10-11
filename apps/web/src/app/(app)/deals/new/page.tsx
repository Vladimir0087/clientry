import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CreateDealForm } from '@/features/deal-form';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';
import { idSchema } from '@clientry/shared/common';

import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchClient, prefetchMembers, prefetchStages } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'New deal' };

const HEADING_ID = 'new-deal-heading';

// A malformed value is dropped here; an unknown one is ignored by the form.
function idFrom(value: string | string[] | undefined): string | undefined {
  const result = idSchema().safeParse(value);
  return result.success ? result.data : undefined;
}

export default async function NewDealPage({
  searchParams,
}: PageProps<'/deals/new'>): Promise<ReactNode> {
  const query = await searchParams;
  const stageId = idFrom(query.stageId);
  const clientId = idFrom(query.clientId);
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchStages(queryClient, request),
    prefetchMembers(queryClient, request),
    clientId === undefined ? undefined : prefetchClient(queryClient, request, clientId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeading id={HEADING_ID}>New deal</PageHeading>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CreateDealForm stageId={stageId} clientId={clientId} headingId={HEADING_ID} />
      </HydrationBoundary>
    </div>
  );
}
