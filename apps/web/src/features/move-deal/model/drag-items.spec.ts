import { describe, expect, it } from 'vitest';

import { DEAL_LIMITS } from '@clientry/shared/deals';
import type { Board } from '@clientry/shared/deals';

import { columnRulesOf, dropResultOf, dropTargetOf, moveAcross, sortWithin } from './drag-items';
import type { ColumnRules } from './drag-items';
import { makeBoard, makeDeal, NEW_STAGE, WON_STAGE } from '../../../../test/deals';

const RULES: ColumnRules = { closed: new Set(['won']), shown: new Map() };
// The board shows the three cards of open, and the server holds more below them.
const TRUNCATED: ColumnRules = { ...RULES, shown: new Map([['open', 3]]) };
const ITEMS = { open: ['a', 'b', 'c'], next: ['d'], won: ['w'] };

describe('drag items', () => {
  it('should insert the card at the hovered card when it crosses into an open column', () => {
    expect(moveAcross(ITEMS, 'a', 'd', RULES)).toEqual({
      open: ['b', 'c'],
      next: ['a', 'd'],
      won: ['w'],
    });
  });

  it('should append the card when it hovers an open column itself', () => {
    expect(moveAcross(ITEMS, 'a', 'next', RULES).next).toEqual(['d', 'a']);
  });

  it('should put the card first when it crosses into a closed column', () => {
    expect(moveAcross(ITEMS, 'c', 'w', RULES).won).toEqual(['c', 'w']);
  });

  it('should report the settled order and target when the card is dropped in a new place', () => {
    const origin = dropTargetOf(ITEMS, 'a', RULES);

    expect(dropResultOf(ITEMS, 'a', 'c', RULES, origin)).toEqual({
      items: { ...ITEMS, open: ['b', 'c', 'a'] },
      target: { stageId: 'open', afterId: 'c' },
    });
  });

  it('should report nothing when the card is dropped where it started', () => {
    const origin = dropTargetOf(ITEMS, 'b', RULES);

    expect(dropResultOf(ITEMS, 'b', 'b', RULES, origin)).toBeNull();
  });

  it('should reorder an open column and leave a closed one when the card is dropped', () => {
    expect(sortWithin(ITEMS, 'a', 'c', RULES).open).toEqual(['b', 'c', 'a']);
    const closed = { ...ITEMS, won: ['x', 'w'] };
    expect(sortWithin(closed, 'x', 'w', RULES)).toBe(closed);
  });

  it('should drop the card above the last shown card when it lands below a truncated column', () => {
    const moved = moveAcross(ITEMS, 'd', 'open', TRUNCATED);
    const origin = dropTargetOf(ITEMS, 'd', TRUNCATED);

    const result = dropResultOf(moved, 'd', 'open', TRUNCATED, origin);

    expect(result).toEqual({
      items: { ...moved, open: ['a', 'b', 'd', 'c'] },
      target: { stageId: 'open', afterId: 'b' },
    });
  });

  it('should keep the drop below the last card when the card is sorted within a truncated column', () => {
    const origin = dropTargetOf(ITEMS, 'a', TRUNCATED);

    expect(dropResultOf(ITEMS, 'a', 'c', TRUNCATED, origin)?.target).toEqual({
      stageId: 'open',
      afterId: 'c',
    });
  });

  it('should list an open column, not a closed one, when it holds more deals than it shows', () => {
    const board = makeBoard([makeDeal(1, { stage: NEW_STAGE }), makeDeal(2, { stage: WON_STAGE })]);
    const truncated: Board = {
      columns: board.columns.map((column) =>
        column.deals.length > 0 ? { ...column, count: column.count + 5 } : column,
      ),
    };

    const rules = columnRulesOf(truncated);

    expect(rules.shown).toEqual(new Map([[NEW_STAGE.id, 1]]));
  });

  it('should count no more shown cards than the board returns when a move left one over it', () => {
    const deals = Array.from({ length: DEAL_LIMITS.boardColumn + 1 }, (_, index) =>
      makeDeal(index + 1, { stage: NEW_STAGE }),
    );
    const board = makeBoard(deals);
    const overfull: Board = {
      columns: board.columns.map((column) => ({ ...column, count: column.count + 5 })),
    };

    const rules = columnRulesOf(overfull);

    expect(rules.shown.get(NEW_STAGE.id)).toBe(DEAL_LIMITS.boardColumn);
  });

  it('should list an open column when it holds exactly as many deals as the board returns', () => {
    const deals = Array.from({ length: DEAL_LIMITS.boardColumn }, (_, index) =>
      makeDeal(index + 1, { stage: NEW_STAGE }),
    );

    const rules = columnRulesOf(makeBoard(deals));

    expect(rules.shown).toEqual(new Map([[NEW_STAGE.id, DEAL_LIMITS.boardColumn]]));
  });

  it('should leave an open column out when it holds fewer deals than the board returns', () => {
    const deals = Array.from({ length: DEAL_LIMITS.boardColumn - 1 }, (_, index) =>
      makeDeal(index + 1, { stage: NEW_STAGE }),
    );

    const rules = columnRulesOf(makeBoard(deals));

    expect(rules.shown.size).toBe(0);
  });

  it('should give the card above as afterId, or null when the card is at the top or closed', () => {
    expect(dropTargetOf(ITEMS, 'b', RULES)).toEqual({ stageId: 'open', afterId: 'a' });
    expect(dropTargetOf(ITEMS, 'a', RULES)).toEqual({ stageId: 'open', afterId: null });
    expect(dropTargetOf({ ...ITEMS, won: ['x', 'w'] }, 'w', RULES)).toEqual({
      stageId: 'won',
      afterId: null,
    });
  });
});
