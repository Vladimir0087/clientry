import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CreateTaskForm } from '@/features/task-form';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';
import { idSchema } from '@clientry/shared/common';

import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchClient, prefetchDeal, prefetchMembers } from '../../_lib/prefetch';
import type { PrefetchRequest } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'New task' };

const HEADING_ID = 'new-task-heading';

// A malformed value is dropped here; an unknown one is ignored by the form.
function idFrom(value: string | string[] | undefined): string | undefined {
  const result = idSchema().safeParse(value);
  return result.success ? result.data : undefined;
}

interface Preset {
  readonly clientId?: string;
  readonly dealId?: string;
}

// A deal names its client, so it wins over a client given with it.
function presetFrom(query: Readonly<Record<string, string | string[] | undefined>>): Preset {
  const dealId = idFrom(query.dealId);
  return dealId === undefined ? { clientId: idFrom(query.clientId) } : { dealId };
}

function prefetchPreset(
  queryClient: QueryClient,
  request: PrefetchRequest,
  { clientId, dealId }: Preset,
): Promise<void> | undefined {
  if (dealId !== undefined) {
    return prefetchDeal(queryClient, request, dealId);
  }
  return clientId === undefined ? undefined : prefetchClient(queryClient, request, clientId);
}

export default async function NewTaskPage({
  searchParams,
}: PageProps<'/tasks/new'>): Promise<ReactNode> {
  const preset = presetFrom(await searchParams);
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchMembers(queryClient, request),
    prefetchPreset(queryClient, request, preset),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeading id={HEADING_ID}>New task</PageHeading>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CreateTaskForm clientId={preset.clientId} dealId={preset.dealId} headingId={HEADING_ID} />
      </HydrationBoundary>
    </div>
  );
}
