import type { ReactNode } from 'react';

import { ClientDetailsSkeleton } from '@/entities/client';
import { Skeleton } from '@/shared/ui/skeleton';

export default function ClientLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-16" />
      <ClientDetailsSkeleton />
    </div>
  );
}
