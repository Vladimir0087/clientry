'use client';

import { cn } from 'cn';
import { useId } from 'react';
import type * as React from 'react';

import { formatTotals } from '@/shared/lib/money';
import { Skeleton } from '@/shared/ui/skeleton';
import type { ClosedDeals, DashboardSummary } from '@clientry/shared/dashboard';

import { PERIOD_MONTHS } from '../model/period-bounds';
import { winStats } from '../model/win-stats';

const NO_VALUE = '—';

interface TileProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

// A labelled group, so a screen reader hears "Open deals, 14, $45,500 · €1,200".
function Tile({ label, children }: TileProps): React.JSX.Element {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <span id={labelId} className="text-sm text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

interface TileValueProps {
  readonly isDanger?: boolean;
  readonly children: React.ReactNode;
}

function TileValue({ isDanger = false, children }: TileValueProps): React.JSX.Element {
  return (
    <span
      className={cn('text-2xl font-semibold tabular-nums', isDanger && 'text-danger-foreground')}
    >
      {children}
    </span>
  );
}

function TileDetail({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <span className="text-sm break-words text-muted-foreground">{children}</span>;
}

function TileSkeleton(): React.JSX.Element {
  return (
    <span data-testid="tile-skeleton" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-4 w-32 max-w-full" />
    </span>
  );
}

interface ClosedTilesProps {
  readonly closedDeals: ClosedDeals | undefined;
  readonly isError: boolean;
}

function ClosedTiles({ closedDeals, isError }: ClosedTilesProps): React.JSX.Element {
  if (closedDeals === undefined) {
    const body = isError ? <TileValue>{NO_VALUE}</TileValue> : <TileSkeleton />;
    return (
      <>
        <Tile label="Won this month">{body}</Tile>
        <Tile label="Win rate">{body}</Tile>
      </>
    );
  }
  const { wonThisMonth, won, closed, rate } = winStats(closedDeals);
  return (
    <>
      <Tile label="Won this month">
        <TileValue>{wonThisMonth.count}</TileValue>
        <TileDetail>
          {wonThisMonth.count === 0
            ? 'No deals won yet this month'
            : formatTotals(wonThisMonth.totals)}
        </TileDetail>
      </Tile>
      <Tile label="Win rate">
        <TileValue>{rate === null ? NO_VALUE : `${String(rate)}%`}</TileValue>
        <TileDetail>
          {closed === 0
            ? 'No deals closed yet'
            : `${String(won)} won of ${String(closed)} closed in ${String(PERIOD_MONTHS)} months`}
        </TileDetail>
      </Tile>
    </>
  );
}

interface DashboardTilesProps {
  readonly summary: DashboardSummary;
  readonly closedDeals: ClosedDeals | undefined;
  readonly isClosedDealsError: boolean;
}

// Counts lead because they never mix currencies; amounts follow below.
export function DashboardTiles({
  summary,
  closedDeals,
  isClosedDealsError,
}: DashboardTilesProps): React.JSX.Element {
  const { openDeals, tasks } = summary;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Open deals">
        <TileValue>{openDeals.count}</TileValue>
        <TileDetail>
          {openDeals.count === 0 ? 'Nothing in the pipeline' : formatTotals(openDeals.totals)}
        </TileDetail>
      </Tile>
      <ClosedTiles closedDeals={closedDeals} isError={isClosedDealsError} />
      <Tile label="Overdue tasks">
        <TileValue isDanger={tasks.overdue > 0}>{tasks.overdue}</TileValue>
        <TileDetail>of {tasks.open} open tasks</TileDetail>
      </Tile>
    </div>
  );
}
