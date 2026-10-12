import type { ReactNode } from 'react';

import { TaskFormSkeleton } from '@/features/task-form';
import { Skeleton } from '@/shared/ui/skeleton';

export default function EditTaskLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <TaskFormSkeleton />
    </div>
  );
}
