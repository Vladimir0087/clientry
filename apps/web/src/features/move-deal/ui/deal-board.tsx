'use client';

import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensorOptions,
  PointerSensorOptions,
  ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { cn } from 'cn';
import { useEffect, useId, useMemo } from 'react';
import type * as React from 'react';

import { useMoveDeal } from '@/entities/deal';
import { isFocusStranded } from '@/shared/lib/is-focus-stranded';
import type { Board, BoardColumn as BoardColumnData, DealCard } from '@clientry/shared/deals';

import { BoardCardOverlay } from './board-card';
import { BoardColumn } from './board-column';
import { boardAnnouncements, SCREEN_READER_INSTRUCTIONS } from '../model/board-announcements';
import { boardKeyboardCoordinates } from '../model/board-keyboard-coordinates';
import type { ColumnItems } from '../model/drag-items';
import { useBoardDrag } from '../model/use-board-drag';
import { useCardFocus } from '../model/use-card-focus';
import type { CardFocus } from '../model/use-card-focus';

// Below it a press on the handle stays a tap.
const DRAG_DISTANCE_PX = 4;
// Fixed objects: useSensor rebuilds a sensor, and every card's listeners, when its options change.
const POINTER_OPTIONS: PointerSensorOptions = {
  activationConstraint: { distance: DRAG_DISTANCE_PX },
};
const KEYBOARD_OPTIONS: KeyboardSensorOptions = { coordinateGetter: boardKeyboardCoordinates };
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

function cardsById(board: Board): ReadonlyMap<string, DealCard> {
  return new Map(board.columns.flatMap((column) => column.deals.map((deal) => [deal.id, deal])));
}

// The dragged order while it lasts, otherwise the board's own.
function dealsOf(
  column: BoardColumnData,
  items: ColumnItems | null,
  cards: ReadonlyMap<string, DealCard>,
): DealCard[] {
  const ids = items?.[column.stage.id] ?? column.deals.map((deal) => deal.id);
  return ids.map((id) => cards.get(id)).filter((deal): deal is DealCard => deal !== undefined);
}

interface BoardAccessibility {
  readonly announcements: Announcements;
  readonly screenReaderInstructions: ScreenReaderInstructions;
}

function useBoardAccessibility(board: Board, getItems: () => ColumnItems): BoardAccessibility {
  return useMemo(
    () => ({
      announcements: boardAnnouncements({ board, getItems }),
      screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
    }),
    [board, getItems],
  );
}

interface BoardColumnsProps {
  readonly board: Board;
  readonly items: ColumnItems | null;
  readonly isDragging: boolean;
  readonly overColumnId: string | null;
  readonly keyboardDragId: string | null;
  readonly isStale: boolean;
  readonly focus: CardFocus;
}

function BoardColumns({
  board,
  items,
  isDragging,
  overColumnId,
  keyboardDragId,
  isStale,
  focus,
}: BoardColumnsProps): React.JSX.Element {
  const cards = useMemo(() => cardsById(board), [board]);
  const stages = useMemo(() => board.columns.map((column) => column.stage), [board]);
  return (
    <div
      // Snapping would fight the small steps dnd-kit scrolls by while a card is dragged.
      // Relative: sr-only text in the cards is absolute and would widen the page otherwise.
      className={cn(
        'relative -mx-4 overflow-x-auto px-4 pb-4',
        !isDragging && 'max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4',
      )}
    >
      <div className="flex w-max items-start gap-4">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.stage.id}
            column={column}
            deals={dealsOf(column, items, cards)}
            isDraggedOver={overColumnId === column.stage.id}
            stages={stages}
            isStale={isStale}
            keyboardDragId={keyboardDragId}
            focusRequest={focus.focusRequest}
            onFocusDone={focus.handleFocusDone}
            onMenuMove={focus.handleMenuMove}
          />
        ))}
      </div>
    </div>
  );
}

// A card gone after its failed move, deleted or filtered out, leaves its focus to the heading.
function useGoneCardFocus(board: Board, focus: CardFocus, headingId: string): void {
  const { focusRequest, handleFocusDone } = focus;
  useEffect(() => {
    // Only a request left by a failure: a request for a move under way waits for its card.
    if (focusRequest?.leaving !== null) {
      return;
    }
    const { dealId } = focusRequest;
    if (board.columns.some((column) => column.deals.some((deal) => deal.id === dealId))) {
      return;
    }
    if (isFocusStranded()) {
      document.getElementById(headingId)?.focus({ preventScroll: !focusRequest.shouldScroll });
    }
    handleFocusDone();
  }, [board, focusRequest, handleFocusDone, headingId]);
}

interface DealBoardProps {
  readonly board: Board;
  // The page heading, where focus goes when the card it followed is gone.
  readonly headingId: string;
  // While another filter loads the board shown is the old one: a move would not show on it.
  readonly isStale?: boolean;
}

export function DealBoard({
  board,
  headingId,
  isStale = false,
}: DealBoardProps): React.JSX.Element {
  // A fixed id keeps dnd-kit's generated ids equal on the server and in the browser.
  const dndId = useId();
  const move = useMoveDeal('board');
  const focus = useCardFocus(move.mutateAsync);
  const drag = useBoardDrag(board, focus.handleDrop);
  useGoneCardFocus(board, focus, headingId);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  const accessibility = useBoardAccessibility(board, drag.getItems);
  const activeCard = board.columns
    .flatMap((column) => column.deals)
    .find((deal) => deal.id === drag.activeId);
  const handleDragStart = (event: DragStartEvent): void => {
    focus.handleDragStart(event.activatorEvent);
    drag.handleDragStart(event);
  };
  const handleDragEnd = (event: DragEndEvent): void => {
    focus.handleDragEnd();
    drag.handleDragEnd(event);
  };
  const handleDragCancel = (): void => {
    focus.handleDragEnd();
    drag.handleDragCancel();
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={MEASURING}
      accessibility={accessibility}
      onDragStart={handleDragStart}
      onDragOver={drag.handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <BoardColumns
        board={board}
        items={drag.items}
        isDragging={drag.activeId !== null}
        overColumnId={drag.overColumnId}
        keyboardDragId={drag.keyboardDragId}
        isStale={isStale}
        focus={focus}
      />
      <DragOverlay>
        {activeCard === undefined ? null : <BoardCardOverlay deal={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
