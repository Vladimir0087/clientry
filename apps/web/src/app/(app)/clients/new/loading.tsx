import type { ReactNode } from 'react';

import { ClientFormSkeleton } from '@/features/client-form';
import { Skeleton } from '@/shared/ui/skeleton';

export default function NewClientLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <ClientFormSkeleton />
    </div>
  );
}
