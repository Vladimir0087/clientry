import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const FIELDS = 7;

export function ClientFormSkeleton(): React.JSX.Element {
  return (
    <div data-testid="client-form-skeleton" className="flex max-w-xl flex-col gap-6">
      {Array.from({ length: FIELDS }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
