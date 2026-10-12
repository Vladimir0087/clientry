import type { ReactNode } from 'react';

import { StageListSkeleton } from '@/features/manage-stages';
import { Skeleton } from '@/shared/ui/skeleton';

export default function StagesLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <StageListSkeleton />
    </div>
  );
}
