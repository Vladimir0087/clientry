import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

export function GreetingSkeleton(): React.JSX.Element {
  return (
    <div data-testid="greeting-skeleton" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-5 w-48 max-w-full" />
    </div>
  );
}
