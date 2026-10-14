import type * as React from 'react';

import { ActivitySkeleton } from '@/entities/activity';
import { TeamSkeleton, TilesSkeleton } from '@/entities/dashboard';
import { Skeleton } from '@/shared/ui/skeleton';

// The layout of the dashboard, so nothing shifts when it loads.
export function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-40" />
      <TilesSkeleton />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TeamSkeleton />
        </div>
        <ActivitySkeleton />
      </div>
    </div>
  );
}
