import { arrayMove } from '@dnd-kit/sortable';

import { isClosedStage } from '@/entities/deal';
import { DEAL_LIMITS } from '@clientry/shared/deals';
import type { Board, BoardColumn } from '@clientry/shared/deals';

// Deal ids per stage id while a card is dragged; stage ids double as the columns' droppable ids.
export type ColumnItems = Readonly<Record<string, readonly string[]>>;

export interface DropTarget {
  readonly stageId: string;
  readonly afterId: string | null;
}

export interface DropPlace {
  readonly stageId: string;
  readonly index: number;
  readonly count: number;
}

export function itemsFromBoard(board: Board): ColumnItems {
  return Object.fromEntries(
    board.columns.map((column) => [column.stage.id, column.deals.map((deal) => deal.id)]),
  );
}

export interface ColumnRules {
  // Closed columns take a card at the top and do not sort.
  readonly closed: ReadonlySet<string>;
  // Open columns that hold more deals than the board returns, or as many as it can, with how
  // many it shows.
  readonly shown: ReadonlyMap<string, number>;
}

function isCapped({ count, deals }: BoardColumn): boolean {
  return count > deals.length || count >= DEAL_LIMITS.boardColumn;
}

export function columnRulesOf(board: Board): ColumnRules {
  const closed = new Set<string>();
  const shown = new Map<string, number>();
  for (const column of board.columns) {
    if (isClosedStage(column.stage.kind)) {
      closed.add(column.stage.id);
    } else if (isCapped(column)) {
      // Capped: until the refetch, a move into the column leaves it a card over the limit.
      shown.set(column.stage.id, Math.min(column.deals.length, DEAL_LIMITS.boardColumn));
    }
  }
  return { closed, shown };
}

// The column an id stands for: a column's own id or the column that holds the card.
export function findColumn(items: ColumnItems, id: string): string | undefined {
  if (id in items) {
    return id;
  }
  return Object.keys(items).find((columnId) => items[columnId]?.includes(id));
}

function listOf(items: ColumnItems, columnId: string): readonly string[] {
  return items[columnId] ?? [];
}

// Crossing into another column; closed columns take the card first, as the server will.
export function moveAcross(
  items: ColumnItems,
  activeId: string,
  overId: string,
  rules: ColumnRules,
): ColumnItems {
  const from = findColumn(items, activeId);
  const to = findColumn(items, overId);
  if (from === undefined || to === undefined || from === to) {
    return items;
  }
  const target = listOf(items, to);
  const overIndex = target.indexOf(overId);
  let index = overIndex === -1 ? target.length : overIndex;
  if (rules.closed.has(to)) {
    index = 0;
  }
  return {
    ...items,
    [from]: listOf(items, from).filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

// The order within an open column is settled on drop; closed columns do not sort.
export function sortWithin(
  items: ColumnItems,
  activeId: string,
  overId: string,
  rules: ColumnRules,
): ColumnItems {
  const column = findColumn(items, activeId);
  if (column === undefined || column !== findColumn(items, overId) || rules.closed.has(column)) {
    return items;
  }
  const list = listOf(items, column);
  const from = list.indexOf(activeId);
  const to = list.indexOf(overId);
  if (to === -1 || from === to) {
    return items;
  }
  return { ...items, [column]: arrayMove([...list], from, to) };
}

// The board returns a truncated column's first cards only: a card dropped below them takes the
// last place shown, or it would vanish on the refetch.
function keepShown(items: ColumnItems, dealId: string, rules: ColumnRules): ColumnItems {
  const stageId = findColumn(items, dealId);
  const shown = stageId === undefined ? undefined : rules.shown.get(stageId);
  if (stageId === undefined || shown === undefined || shown < 1) {
    return items;
  }
  const list = listOf(items, stageId);
  const index = list.indexOf(dealId);
  if (index < shown) {
    return items;
  }
  return { ...items, [stageId]: arrayMove([...list], index, shown - 1) };
}

function settle(
  items: ColumnItems,
  activeId: string,
  overId: string,
  rules: ColumnRules,
): ColumnItems {
  return keepShown(sortWithin(items, activeId, overId, rules), activeId, rules);
}

// Where a drop now would leave the card, worked out the way the drop itself does it.
export function dropPlaceOf(
  items: ColumnItems,
  activeId: string,
  overId: string,
  rules: ColumnRules,
): DropPlace | undefined {
  const settled = settle(items, activeId, overId, rules);
  const stageId = findColumn(settled, activeId);
  if (stageId === undefined) {
    return undefined;
  }
  const list = listOf(settled, stageId);
  return { stageId, index: list.indexOf(activeId), count: list.length };
}

export function dropTargetOf(
  items: ColumnItems,
  dealId: string,
  rules: ColumnRules,
): DropTarget | undefined {
  const stageId = findColumn(items, dealId);
  if (stageId === undefined) {
    return undefined;
  }
  const list = listOf(items, stageId);
  const index = list.indexOf(dealId);
  const afterId = rules.closed.has(stageId) || index < 1 ? null : (list[index - 1] ?? null);
  return { stageId, afterId };
}

function isSameTarget(first: DropTarget | undefined, second: DropTarget | undefined): boolean {
  return first?.stageId === second?.stageId && first?.afterId === second?.afterId;
}

export interface DropResult {
  readonly items: ColumnItems;
  readonly target: DropTarget;
}

// The order to keep after a drop and where the card went, or null when nothing moved.
export function dropResultOf(
  items: ColumnItems | null,
  dealId: string,
  overId: string | null,
  rules: ColumnRules,
  origin: DropTarget | undefined,
): DropResult | null {
  if (items === null || overId === null) {
    return null;
  }
  const settled = settle(items, dealId, overId, rules);
  const target = dropTargetOf(settled, dealId, rules);
  if (target === undefined || isSameTarget(target, origin)) {
    return null;
  }
  return { items: settled, target };
}
