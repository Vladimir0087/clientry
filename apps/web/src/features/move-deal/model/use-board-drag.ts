import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { MoveDealVariables } from '@/entities/deal';
import type { Board } from '@clientry/shared/deals';

import {
  columnRulesOf,
  dropResultOf,
  dropTargetOf,
  findColumn,
  itemsFromBoard,
  moveAcross,
} from './drag-items';
import type { ColumnItems, ColumnRules, DropTarget } from './drag-items';

export interface BoardDrag {
  readonly activeId: string | null;
  // The card lifted from the keyboard: its handle keeps focus while it crosses columns.
  readonly keyboardDragId: string | null;
  // The order to render: the dragged one while it lasts, otherwise null for the board's own.
  readonly items: ColumnItems | null;
  // The column under the dragged card, hovered itself or through one of its cards.
  readonly overColumnId: string | null;
  readonly getItems: () => ColumnItems;
  readonly handleDragStart: (event: DragStartEvent) => void;
  readonly handleDragOver: (event: DragOverEvent) => void;
  readonly handleDragEnd: (event: DragEndEvent) => void;
  readonly handleDragCancel: () => void;
}

interface DraggedItems {
  readonly items: ColumnItems | null;
  readonly readItems: () => ColumnItems | null;
  readonly writeItems: (next: ColumnItems | null) => void;
  readonly getItems: () => ColumnItems;
}

// After a drop the dragged order stays until the cache shows the move, so the card never
// flashes back to its old place and keyboard focus can return to its handle.
function useDraggedItems(board: Board, activeId: string | null): DraggedItems {
  const [items, setItems] = useState<ColumnItems | null>(null);
  const [seenBoard, setSeenBoard] = useState(board);
  const itemsRef = useRef<ColumnItems | null>(null);
  const getItems = useCallback(() => itemsRef.current ?? itemsFromBoard(board), [board]);
  if (board !== seenBoard) {
    setSeenBoard(board);
    if (activeId === null) {
      setItems(null);
    }
  }
  return {
    items,
    readItems: () => itemsRef.current,
    writeItems: (next) => {
      itemsRef.current = next;
      setItems(next);
    },
    getItems,
  };
}

interface OverColumn {
  readonly overColumnId: string | null;
  readonly handleDragOver: (event: DragOverEvent) => void;
  readonly clearOver: () => void;
}

// dnd-kit fires over events when the hovered item changes, not on every move of the pointer.
function useOverColumn(dragged: DraggedItems, rules: ColumnRules): OverColumn {
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  return {
    overColumnId,
    handleDragOver: ({ active, over }) => {
      const current = dragged.readItems();
      if (over === null || current === null) {
        setOverColumnId(null);
        return;
      }
      const next = moveAcross(current, String(active.id), String(over.id), rules);
      setOverColumnId(findColumn(next, String(over.id)) ?? null);
      if (next !== current) {
        dragged.writeItems(next);
      }
    },
    clearOver: () => {
      setOverColumnId(null);
    },
  };
}

export function useBoardDrag(board: Board, onDrop: (move: MoveDealVariables) => void): BoardDrag {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isKeyboardDrag, setIsKeyboardDrag] = useState(false);
  const dragged = useDraggedItems(board, activeId);
  const rules = useMemo(() => columnRulesOf(board), [board]);
  const { overColumnId, handleDragOver, clearOver } = useOverColumn(dragged, rules);
  const originRef = useRef<DropTarget | undefined>(undefined);
  const stopDrag = (next: ColumnItems | null): void => {
    setActiveId(null);
    clearOver();
    dragged.writeItems(next);
  };

  return {
    activeId,
    keyboardDragId: isKeyboardDrag ? activeId : null,
    items: dragged.items,
    overColumnId,
    getItems: dragged.getItems,
    handleDragStart: ({ active, activatorEvent }) => {
      setIsKeyboardDrag(activatorEvent instanceof KeyboardEvent);
      const start = itemsFromBoard(board);
      originRef.current = dropTargetOf(start, String(active.id), rules);
      setActiveId(String(active.id));
      dragged.writeItems(start);
    },
    handleDragOver,
    handleDragEnd: ({ active, over }) => {
      const dealId = String(active.id);
      const overId = over === null ? null : String(over.id);
      const result = dropResultOf(dragged.readItems(), dealId, overId, rules, originRef.current);
      stopDrag(result?.items ?? null);
      if (result !== null) {
        onDrop({ dealId, ...result.target });
      }
    },
    handleDragCancel: () => {
      stopDrag(null);
    },
  };
}
