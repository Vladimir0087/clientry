import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const SKELETON_COLUMNS = 4;
const SKELETON_CARDS = 3;
const DETAIL_ROWS = 3;
const HISTORY_ROWS = 3;
const CLIENT_DEAL_ROWS = 2;

export function BoardSkeleton(): React.JSX.Element {
  return (
    <div data-testid="board-skeleton" className="flex gap-4 overflow-hidden">
      {Array.from({ length: SKELETON_COLUMNS }, (_, column) => (
        <div key={column} className="flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: SKELETON_CARDS }, (_, card) => (
            <Skeleton key={card} className="h-24 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DealDetailsSkeleton(): React.JSX.Element {
  return (
    <div data-testid="deal-details-skeleton" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-5 w-40 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: DETAIL_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full max-w-md" />
        ))}
      </div>
    </div>
  );
}

export function DealHistorySkeleton(): React.JSX.Element {
  return (
    <div data-testid="deal-history-skeleton" className="flex flex-col gap-3">
      {Array.from({ length: HISTORY_ROWS }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ClientDealsSkeleton(): React.JSX.Element {
  return (
    <div data-testid="client-deals-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: CLIENT_DEAL_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
