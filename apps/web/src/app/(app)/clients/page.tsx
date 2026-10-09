import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { loadClientFilters } from '@/features/client-filters';
import { createQueryClient } from '@/shared/api/query-client';

import { ClientsView } from './_components/clients-view';
import { getPrefetchRequest } from '../_lib/access-session';
import { prefetchClientList } from '../_lib/prefetch';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage({
  searchParams,
}: PageProps<'/clients'>): Promise<ReactNode> {
  const filters = await loadClientFilters(searchParams);
  const queryClient = createQueryClient();
  await prefetchClientList(queryClient, await getPrefetchRequest(), filters);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ClientsView />
    </HydrationBoundary>
  );
}
