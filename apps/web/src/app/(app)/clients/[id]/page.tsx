import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { clientIdParamsSchema } from '@clientry/shared/clients';

import { ClientView } from './_components/client-view';
import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchClient } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'Client' };

export default async function ClientPage({
  params,
}: PageProps<'/clients/[id]'>): Promise<ReactNode> {
  const { id } = await params;
  // A malformed id would only earn a 400 from the API.
  if (!clientIdParamsSchema.safeParse({ id }).success) {
    notFound();
  }
  const queryClient = createQueryClient();
  await prefetchClient(queryClient, await getPrefetchRequest(), id);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ClientView id={id} />
    </HydrationBoundary>
  );
}
