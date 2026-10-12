'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { cn } from 'cn';
import { memo, useId } from 'react';
import type * as React from 'react';

import { BoardColumnHeader, isClosedStage } from '@/entities/deal';
import type { BoardColumn as BoardColumnData, DealCard, Stage } from '@clientry/shared/deals';

import { BoardCard } from './board-card';
import type { CardFocusRequest } from '../model/use-card-focus';

// Closed columns order cards by close date, so nothing shifts while a card hovers over them.
const NO_SORTING: SortingStrategy = () => null;

// The column renders again whenever the dragged card passes over another; its header does not.
const ColumnHeader = memo(BoardColumnHeader);

interface BoardColumnProps {
  readonly column: BoardColumnData;
  readonly deals: readonly DealCard[];
  // The dragged card is over the column or one of its cards.
  readonly isDraggedOver: boolean;
  readonly stages: readonly Stage[];
  readonly isStale: boolean;
  readonly keyboardDragId: string | null;
  readonly focusRequest: CardFocusRequest | null;
  readonly onFocusDone: () => void;
  readonly onMenuMove: (dealId: string, fromStageId: string, toStageId: string) => void;
}

interface ColumnCardsProps extends Omit<BoardColumnProps, 'column' | 'isDraggedOver'> {
  readonly stageId: string;
  readonly isClosed: boolean;
}

function ColumnCards({ stageId, isClosed, deals, ...card }: ColumnCardsProps): React.JSX.Element {
  return (
    <SortableContext
      id={stageId}
      items={deals.map((deal) => deal.id)}
      strategy={isClosed ? NO_SORTING : verticalListSortingStrategy}
    >
      {deals.length === 0 ? (
        <p className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No deals
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deals.map((deal) => (
            <BoardCard key={deal.id} deal={deal} stageId={stageId} {...card} />
          ))}
        </ul>
      )}
    </SortableContext>
  );
}

export function BoardColumn({
  column,
  isDraggedOver,
  ...cards
}: BoardColumnProps): React.JSX.Element {
  const headingId = useId();
  const { stage } = column;
  const isClosed = isClosedStage(stage.kind);
  const { setNodeRef: setDropRef } = useDroppable({ id: stage.id });
  const hiddenCount = column.count - column.deals.length;
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-xl bg-muted/50 p-3"
    >
      <ColumnHeader column={column} headingId={headingId} />
      <div
        ref={setDropRef}
        className={cn(
          'flex min-h-24 flex-col rounded-lg transition-colors',
          isClosed && isDraggedOver && 'ring-2 ring-ring/50',
        )}
      >
        <ColumnCards stageId={stage.id} isClosed={isClosed} {...cards} />
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {column.deals.length} of {column.count} deals
        </p>
      )}
    </section>
  );
}
