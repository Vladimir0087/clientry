import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { clientIdParamsSchema } from '@clientry/shared/clients';

import { ClientView } from './_components/client-view';
import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchClient, prefetchClientDeals, prefetchTaskList } from '../../_lib/prefetch';
import { taskSectionFilters } from '../../_lib/task-section-filters';

export const metadata: Metadata = { title: 'Client' };

export default async function ClientPage({
  params,
}: PageProps<'/clients/[id]'>): Promise<ReactNode> {
  const parsed = clientIdParamsSchema.safeParse(await params);
  // A malformed id would only earn a 400 from the API.
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchClient(queryClient, request, id),
    prefetchClientDeals(queryClient, request, id),
    prefetchTaskList(queryClient, request, taskSectionFilters({ clientId: id })),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ClientView id={id} />
    </HydrationBoundary>
  );
}
