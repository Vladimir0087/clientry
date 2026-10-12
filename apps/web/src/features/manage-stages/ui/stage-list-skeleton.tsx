import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const SKELETON_ROWS = 6;

export function StageListSkeleton(): React.JSX.Element {
  return (
    <div data-testid="stage-list-skeleton" className="flex max-w-3xl flex-col gap-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
