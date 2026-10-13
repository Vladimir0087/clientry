import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { loadTaskFilters } from '@/features/task-filters';
import { createQueryClient } from '@/shared/api/query-client';

import { TasksView } from './_components/tasks-view';
import { getPrefetchRequest } from '../_lib/access-session';
import { prefetchTaskList, prefetchFilterMembers } from '../_lib/prefetch';

export const metadata: Metadata = { title: 'Tasks' };

export default async function TasksPage({ searchParams }: PageProps<'/tasks'>): Promise<ReactNode> {
  const filters = await loadTaskFilters(searchParams);
  const queryClient = createQueryClient();
  const request = await getPrefetchRequest();
  await Promise.all([
    prefetchTaskList(queryClient, request, filters),
    prefetchFilterMembers(queryClient, request, filters.assignee),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TasksView />
    </HydrationBoundary>
  );
}
