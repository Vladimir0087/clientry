import type * as React from 'react';

import { Skeleton } from '@/shared/ui/skeleton';

const TILES = 4;
const TEAM_ROWS = 3;

export function TilesSkeleton(): React.JSX.Element {
  return (
    <div data-testid="tiles-skeleton" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: TILES }, (_, index) => (
        <Skeleton key={index} className="h-26 rounded-xl" />
      ))}
    </div>
  );
}

export function TeamSkeleton(): React.JSX.Element {
  return (
    <div data-testid="team-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: TEAM_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-12" />
      ))}
    </div>
  );
}
