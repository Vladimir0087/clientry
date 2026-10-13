'use client';

import { cn } from 'cn';
import { PlusIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRef } from 'react';
import type * as React from 'react';

import { BoardSkeleton, newDealPath, STAGES_PATH, useBoard } from '@/entities/deal';
import { useSession } from '@/entities/session';
import { BoardAssigneeMenu, useBoardFilters } from '@/features/deal-filters';
import type { BoardFiltersState } from '@/features/deal-filters';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import { hasPermission } from '@clientry/shared/auth';
import type { Board } from '@clientry/shared/deals';

import { useFilterSubject } from '../../_lib/use-filter-subject';
import type { FilterSubject } from '../../_lib/use-filter-subject';

const HEADING_ID = 'deals-heading';

// dnd-kit is the heaviest part of the page, so it loads in its own chunk.
const DealBoard = dynamic(() => import('@/features/move-deal').then((slice) => slice.DealBoard), {
  loading: () => <BoardSkeleton />,
});

function BoardActions(): React.JSX.Element {
  const session = useSession();
  return (
    <div className="flex flex-wrap gap-2">
      {session.data !== undefined && hasPermission(session.data.role, 'stages.manage') && (
        <Button variant="outline" asChild>
          <Link href={STAGES_PATH}>Edit stages</Link>
        </Button>
      )}
      <Button asChild>
        <Link href={newDealPath()}>
          <PlusIcon aria-hidden="true" />
          New deal
        </Link>
      </Button>
    </div>
  );
}

interface EmptyLineProps {
  readonly board: Board;
  readonly subject: FilterSubject;
  readonly onShowAll: () => void;
}

function emptyText(subject: Exclude<FilterSubject, { kind: 'anyone' }>): string {
  if (subject.kind === 'me') {
    return 'No deals are assigned to you.';
  }
  return `No deals are assigned to ${subject.name ?? 'this member'}.`;
}

function EmptyLine({ board, subject, onShowAll }: EmptyLineProps): React.JSX.Element | null {
  const total = board.columns.reduce((sum, column) => sum + column.count, 0);
  if (total > 0) {
    return null;
  }
  if (subject.kind === 'anyone') {
    return <p className="text-muted-foreground">No deals yet. Add the first one with New deal.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-muted-foreground">{emptyText(subject)}</p>
      <Button variant="outline" size="sm" onClick={onShowAll}>
        Show all deals
      </Button>
    </div>
  );
}

interface BoardBodyProps {
  readonly filters: BoardFiltersState;
  readonly onShowAll: () => void;
}

function BoardBody({ filters, onShowAll }: BoardBodyProps): React.JSX.Element {
  const board = useBoard(filters.filters);
  const subject = useFilterSubject(filters.filters.assignee);
  if (board.data === undefined) {
    if (!board.isError) {
      return <BoardSkeleton />;
    }
    const handleRetry = (): void => {
      void board.refetch();
    };
    return (
      <RetryMessage
        message="We could not load the board."
        focusTargetId={HEADING_ID}
        onRetry={handleRetry}
      />
    );
  }
  return (
    <div
      aria-busy={board.isPlaceholderData}
      className={cn(
        'flex flex-col gap-4 transition-opacity',
        board.isPlaceholderData && 'opacity-60',
      )}
    >
      {!board.isPlaceholderData && (
        <EmptyLine board={board.data} subject={subject} onShowAll={onShowAll} />
      )}
      <DealBoard board={board.data} headingId={HEADING_ID} isStale={board.isPlaceholderData} />
    </div>
  );
}

export function BoardView(): React.JSX.Element {
  const filters = useBoardFilters();
  const menuRef = useRef<HTMLButtonElement>(null);
  // Show all deals goes with the empty line, so the menu, now on anyone, takes its focus.
  const handleShowAll = (): void => {
    filters.setAssignee(null);
    menuRef.current?.focus();
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading id={HEADING_ID}>Deals</PageHeading>
        <BoardActions />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BoardAssigneeMenu ref={menuRef} state={filters} />
      </div>
      <BoardBody filters={filters} onShowAll={handleShowAll} />
    </div>
  );
}
