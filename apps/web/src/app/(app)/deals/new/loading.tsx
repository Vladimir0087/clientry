import type { ReactNode } from 'react';

import { DealFormSkeleton } from '@/features/deal-form';
import { Skeleton } from '@/shared/ui/skeleton';

export default function NewDealLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <DealFormSkeleton />
    </div>
  );
}
