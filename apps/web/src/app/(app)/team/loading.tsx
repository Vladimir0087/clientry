import type { ReactNode } from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

export default function TeamLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
