import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { taskIdParamsSchema } from '@clientry/shared/tasks';

import { TaskView } from './_components/task-view';
import { getPrefetchRequest } from '../../_lib/access-session';
import { prefetchTask } from '../../_lib/prefetch';

export const metadata: Metadata = { title: 'Task' };

export default async function TaskPage({ params }: PageProps<'/tasks/[id]'>): Promise<ReactNode> {
  const parsed = taskIdParamsSchema.safeParse(await params);
  // A malformed id would only earn a 400 from the API.
  if (!parsed.success) {
    notFound();
  }
  // The parsed id is lowercase, as the API answers it, so the cache keys match.
  const { id } = parsed.data;
  const queryClient = createQueryClient();
  await prefetchTask(queryClient, await getPrefetchRequest(), id);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TaskView id={id} />
    </HydrationBoundary>
  );
}
