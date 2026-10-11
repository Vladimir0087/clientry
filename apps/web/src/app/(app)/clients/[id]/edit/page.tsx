import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { EditClientForm } from '@/features/client-form';
import { createQueryClient } from '@/shared/api/query-client';
import { clientIdParamsSchema } from '@clientry/shared/clients';

import { getPrefetchRequest } from '../../../_lib/access-session';
import { prefetchClient } from '../../../_lib/prefetch';

export const metadata: Metadata = { title: 'Edit client' };

export default async function EditClientPage({
  params,
}: PageProps<'/clients/[id]/edit'>): Promise<ReactNode> {
  const parsed = clientIdParamsSchema.safeParse(await params);
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  await prefetchClient(queryClient, await getPrefetchRequest(), id);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditClientForm id={id} />
    </HydrationBoundary>
  );
}
