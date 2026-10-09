import type { ReactNode } from 'react';

import { ClientListSkeleton } from '@/entities/client';
import { Skeleton } from '@/shared/ui/skeleton';

export default function ClientsLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-full max-w-xl" />
      <ClientListSkeleton />
    </div>
  );
}
