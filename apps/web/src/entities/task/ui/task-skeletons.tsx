import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const LIST_ROWS = 5;
const DETAIL_ROWS = 4;

export function TaskListSkeleton({
  rows = LIST_ROWS,
}: {
  readonly rows?: number;
}): React.JSX.Element {
  return (
    <div data-testid="task-list-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function TaskDetailsSkeleton(): React.JSX.Element {
  return (
    <div data-testid="task-details-skeleton" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-9 w-56 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: DETAIL_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full max-w-md" />
        ))}
      </div>
    </div>
  );
}
