import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

import type { Board } from '@clientry/shared/deals';

import { columnRulesOf, dropPlaceOf, findColumn } from './drag-items';
import type { ColumnItems, ColumnRules } from './drag-items';

export const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Press Space to pick up a deal. Use the arrow keys to move it, Space to drop it and Escape to cancel.',
};

interface AnnouncementSource {
  readonly board: Board;
  // Read at the time of the event: the items move between columns while the card is dragged.
  readonly getItems: () => ColumnItems;
}

function titleOf(board: Board, dealId: string): string {
  for (const column of board.columns) {
    const deal = column.deals.find((card) => card.id === dealId);
    if (deal !== undefined) {
      return deal.title;
    }
  }
  return 'The deal';
}

function stageNameOf(board: Board, stageId: string | undefined): string {
  return board.columns.find((column) => column.stage.id === stageId)?.stage.name ?? 'no stage';
}

function describePlace(
  { board, getItems }: AnnouncementSource,
  rules: ColumnRules,
  activeId: string,
  overId: string,
): string | undefined {
  const place = dropPlaceOf(getItems(), activeId, overId, rules);
  if (place === undefined) {
    return undefined;
  }
  return `${titleOf(board, activeId)} is in ${stageNameOf(board, place.stageId)}, position ${String(place.index + 1)} of ${String(place.count)}.`;
}

export function boardAnnouncements(source: AnnouncementSource): Announcements {
  const { board, getItems } = source;
  const rules = columnRulesOf(board);
  // dnd-kit reports the lifted card over itself in the same task, which would replace the pick-up.
  let isJustPickedUp = false;
  return {
    onDragStart: ({ active }) => {
      isJustPickedUp = true;
      const id = String(active.id);
      return `Picked up ${titleOf(board, id)} in ${stageNameOf(board, findColumn(getItems(), id))}.`;
    },
    onDragOver: ({ active, over }) => {
      const isPickUpEcho = isJustPickedUp && over?.id === active.id;
      isJustPickedUp = false;
      if (over === null || isPickUpEcho) {
        return undefined;
      }
      return describePlace(source, rules, String(active.id), String(over.id));
    },
    onDragEnd: ({ active, over }) => {
      isJustPickedUp = false;
      const id = String(active.id);
      if (over === null) {
        return `Moving ${titleOf(board, id)} was cancelled.`;
      }
      return `Dropped ${titleOf(board, id)} in ${stageNameOf(board, findColumn(getItems(), id))}.`;
    },
    onDragCancel: ({ active }) => {
      isJustPickedUp = false;
      return `Moving ${titleOf(board, String(active.id))} was cancelled.`;
    },
  };
}
