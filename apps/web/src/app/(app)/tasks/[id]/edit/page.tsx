import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { EditTaskForm } from '@/features/task-form';
import { createQueryClient } from '@/shared/api/query-client';
import { taskIdParamsSchema } from '@clientry/shared/tasks';

import { getPrefetchRequest } from '../../../_lib/access-session';
import { prefetchMembers, prefetchTask } from '../../../_lib/prefetch';

export const metadata: Metadata = { title: 'Edit task' };

export default async function EditTaskPage({
  params,
}: PageProps<'/tasks/[id]/edit'>): Promise<ReactNode> {
  const parsed = taskIdParamsSchema.safeParse(await params);
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchTask(queryClient, request, id),
    prefetchMembers(queryClient, request),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditTaskForm id={id} />
    </HydrationBoundary>
  );
}
