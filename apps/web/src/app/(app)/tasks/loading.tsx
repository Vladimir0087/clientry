import type { ReactNode } from 'react';

import { TaskListSkeleton } from '@/entities/task';
import { Skeleton } from '@/shared/ui/skeleton';

export default function TasksLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-56" />
      <TaskListSkeleton />
    </div>
  );
}
