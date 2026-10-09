import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const SKELETON_ROWS = 5;
const DETAIL_ROWS = 6;

export function ClientListSkeleton(): React.JSX.Element {
  return (
    <div data-testid="client-list-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ClientDetailsSkeleton(): React.JSX.Element {
  return (
    <div data-testid="client-details-skeleton" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-5 w-40 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: DETAIL_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full max-w-md" />
        ))}
      </div>
    </div>
  );
}
