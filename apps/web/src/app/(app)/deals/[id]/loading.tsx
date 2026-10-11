import type { ReactNode } from 'react';

import { DealDetailsSkeleton } from '@/entities/deal';
import { Skeleton } from '@/shared/ui/skeleton';

export default function DealLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-16" />
      <DealDetailsSkeleton />
    </div>
  );
}
