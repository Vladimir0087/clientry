import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

// Edit has no Stage field: a deal moves through the board, not the form.
const CREATE_FIELDS = 5;
const EDIT_FIELDS = 4;

export function DealFormSkeleton({
  isEdit = false,
}: {
  readonly isEdit?: boolean;
}): React.JSX.Element {
  return (
    <div data-testid="deal-form-skeleton" className="flex max-w-xl flex-col gap-6">
      {Array.from({ length: isEdit ? EDIT_FIELDS : CREATE_FIELDS }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
