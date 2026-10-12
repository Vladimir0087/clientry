import type { ReactNode } from 'react';

import { BoardSkeleton } from '@/entities/deal';
import { Skeleton } from '@/shared/ui/skeleton';

export default function DealsLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-28" />
      <BoardSkeleton />
    </div>
  );
}
