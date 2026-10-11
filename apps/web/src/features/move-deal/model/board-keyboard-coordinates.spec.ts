import type {
  ClientRect,
  DroppableContainer,
  DroppableContainers,
  SensorContext,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';

import { boardKeyboardCoordinates } from './board-keyboard-coordinates';

// Cards stacked 100 px apart in columns 150 px apart; New is the shorter column.
const COLUMNS: Readonly<Record<string, readonly string[]>> = {
  new: ['new-1', 'new-2'],
  call: ['call-1', 'call-2', 'call-3', 'call-4'],
};
const COLUMN_IDS = Object.keys(COLUMNS);
const COLUMN_STEP_PX = 150;
const CARD_STEP_PX = 100;
const BOARD_TOP_PX = 100;

function rectAt(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function placeOf(cardId: string): { readonly column: string; readonly index: number } {
  const column = COLUMN_IDS.find((id) => COLUMNS[id]?.includes(cardId)) ?? '';
  return { column, index: COLUMNS[column]?.indexOf(cardId) ?? -1 };
}

function cardRect(cardId: string): ClientRect {
  const { column, index } = placeOf(cardId);
  const left = COLUMN_IDS.indexOf(column) * COLUMN_STEP_PX;
  return rectAt(left, BOARD_TOP_PX + index * CARD_STEP_PX, 140, 90);
}

function columnRect(columnId: string): ClientRect {
  return rectAt(COLUMN_IDS.indexOf(columnId) * COLUMN_STEP_PX, BOARD_TOP_PX, 140, 600);
}

function droppable(id: string, data: object): DroppableContainer {
  return {
    id,
    key: id,
    data: { current: data },
    disabled: false,
    node: { current: document.createElement('div') },
    rect: { current: null },
  };
}

// Cards carry the sortable data dnd-kit registers them with; columns are plain droppables.
function cardDroppable(cardId: string): DroppableContainer {
  const { column, index } = placeOf(cardId);
  return droppable(cardId, { sortable: { containerId: column, index, items: COLUMNS[column] } });
}

function droppablesOf(entries: readonly DroppableContainer[]): DroppableContainers {
  const map = new Map(entries.map((entry) => [entry.id, entry]));
  return Object.assign(map, {
    toArray: () => [...map.values()],
    getEnabled: () => [...map.values()].filter((entry) => !entry.disabled),
    getNodeFor: (id: UniqueIdentifier | null | undefined) =>
      id === null || id === undefined ? undefined : (map.get(id)?.node.current ?? undefined),
  });
}

function contextFor(activeId: string): SensorContext {
  const cardIds = Object.values(COLUMNS).flat();
  const collisionRect = cardRect(activeId);
  return {
    activatorEvent: null,
    active: {
      id: activeId,
      data: { current: undefined },
      rect: { current: { initial: collisionRect, translated: collisionRect } },
    },
    activeNode: null,
    collisionRect,
    collisions: null,
    draggableNodes: new Map(),
    draggingNode: null,
    draggingNodeRect: null,
    droppableRects: new Map([
      ...COLUMN_IDS.map((id) => [id, columnRect(id)] as const),
      ...cardIds.map((id) => [id, cardRect(id)] as const),
    ]),
    droppableContainers: droppablesOf([
      ...COLUMN_IDS.map((id) => droppable(id, {})),
      ...cardIds.map(cardDroppable),
    ]),
    over: null,
    scrollableAncestors: [],
    scrollAdjustedTranslate: null,
  };
}

function press(code: string, activeId: string): ReturnType<typeof boardKeyboardCoordinates> {
  const { left, top } = cardRect(activeId);
  return boardKeyboardCoordinates(new KeyboardEvent('keydown', { code }), {
    active: activeId,
    currentCoordinates: { x: left, y: top },
    context: contextFor(activeId),
  });
}

describe('boardKeyboardCoordinates', () => {
  it('should keep the card in place when ArrowDown is pressed on the last card of a short column', () => {
    const coordinates = press('ArrowDown', 'new-2');

    expect(coordinates).toBeUndefined();
  });

  it('should move to the next card of the same column when ArrowDown is pressed', () => {
    const coordinates = press('ArrowDown', 'new-1');

    expect(coordinates).toEqual({ x: 0, y: BOARD_TOP_PX + CARD_STEP_PX });
  });

  it('should move to the card above in the same column when ArrowUp is pressed', () => {
    const coordinates = press('ArrowUp', 'call-3');

    expect(coordinates).toEqual({ x: COLUMN_STEP_PX, y: BOARD_TOP_PX + CARD_STEP_PX });
  });

  it('should move to the neighbouring column at the same height when ArrowRight is pressed', () => {
    const coordinates = press('ArrowRight', 'new-2');

    expect(coordinates).toEqual({ x: COLUMN_STEP_PX, y: BOARD_TOP_PX + CARD_STEP_PX });
  });
});
