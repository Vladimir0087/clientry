import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const ROWS = 5;

export function ActivitySkeleton(): React.JSX.Element {
  return (
    <div data-testid="activity-skeleton" className="flex flex-col gap-3">
      {Array.from({ length: ROWS }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
