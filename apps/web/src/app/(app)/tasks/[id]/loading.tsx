import type { ReactNode } from 'react';

import { TaskDetailsSkeleton } from '@/entities/task';
import { Skeleton } from '@/shared/ui/skeleton';

export default function TaskLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-16" />
      <TaskDetailsSkeleton />
    </div>
  );
}
