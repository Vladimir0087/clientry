import type { Active, Announcements, Over } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';

import { boardAnnouncements } from './board-announcements';
import { columnRulesOf, itemsFromBoard, moveAcross } from './drag-items';
import type { ColumnItems } from './drag-items';
import { CALL_STAGE, makeBoard, makeDeal, NEW_STAGE, WON_STAGE } from '../../../../test/deals';

const DEAL = makeDeal(1, { stage: NEW_STAGE });
const NEIGHBOUR = makeDeal(2, { stage: NEW_STAGE });
const CALLED = makeDeal(3, { stage: CALL_STAGE });
const WON_FIRST = makeDeal(4, { stage: WON_STAGE });
const WON_SECOND = makeDeal(5, { stage: WON_STAGE });
const BOARD = makeBoard([DEAL, NEIGHBOUR, CALLED, WON_FIRST, WON_SECOND]);
const RULES = columnRulesOf(BOARD);
const RECT = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };

function active(id: string): Active {
  return {
    id,
    data: { current: undefined },
    rect: { current: { initial: null, translated: null } },
  };
}

function over(id: string): Over {
  return { id, rect: RECT, disabled: false, data: { current: undefined } };
}

function announcementsFor(items: ColumnItems): Announcements {
  return boardAnnouncements({ board: BOARD, getItems: () => items });
}

function crossedInto(overId: string): ColumnItems {
  return moveAcross(itemsFromBoard(BOARD), DEAL.id, overId, RULES);
}

describe('boardAnnouncements', () => {
  it('should name the column when a card is picked up', () => {
    const announcements = announcementsFor(itemsFromBoard(BOARD));

    expect(announcements.onDragStart({ active: active(DEAL.id) })).toBe('Picked up Deal 1 in New.');
  });

  it('should give the hovered card place when the card hovers its own column', () => {
    const announcements = announcementsFor(itemsFromBoard(BOARD));

    expect(announcements.onDragOver({ active: active(DEAL.id), over: over(NEIGHBOUR.id) })).toBe(
      'Deal 1 is in New, position 2 of 2.',
    );
  });

  it('should keep the pick-up when the lifted card is reported over itself', () => {
    const announcements = announcementsFor(itemsFromBoard(BOARD));

    announcements.onDragStart({ active: active(DEAL.id) });

    expect(
      announcements.onDragOver({ active: active(DEAL.id), over: over(DEAL.id) }),
    ).toBeUndefined();
  });

  it('should give the place it was put in when the card hovers itself after crossing', () => {
    const announcements = announcementsFor(crossedInto(CALLED.id));
    announcements.onDragStart({ active: active(DEAL.id) });
    announcements.onDragOver({ active: active(DEAL.id), over: over(CALLED.id) });

    expect(announcements.onDragOver({ active: active(DEAL.id), over: over(DEAL.id) })).toBe(
      'Deal 1 is in Call, position 1 of 2.',
    );
  });

  it('should give the first place when the card hovers a card of a closed column', () => {
    const announcements = announcementsFor(crossedInto(WON_SECOND.id));

    expect(announcements.onDragOver({ active: active(DEAL.id), over: over(WON_SECOND.id) })).toBe(
      'Deal 1 is in Paid, position 1 of 3.',
    );
  });

  it('should name the column the card ends in when it is dropped', () => {
    const announcements = announcementsFor(crossedInto(CALLED.id));

    expect(announcements.onDragEnd({ active: active(DEAL.id), over: over(CALLED.id) })).toBe(
      'Dropped Deal 1 in Call.',
    );
  });
});
