import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

// Title, due date and time, reminder, assignee, client, deal.
const FIELD_ROWS = 6;

export function TaskFormSkeleton(): React.JSX.Element {
  return (
    <div data-testid="task-form-skeleton" className="flex max-w-xl flex-col gap-6">
      {Array.from({ length: FIELD_ROWS }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
