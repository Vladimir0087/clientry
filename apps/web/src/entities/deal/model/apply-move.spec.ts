import { describe, expect, it } from 'vitest';

import type { Board } from '@clientry/shared/deals';

import { applyMove, revertMove, withServerDeal } from './apply-move';
import { CALL_STAGE, makeBoard, makeDeal, NEW_STAGE, WON_STAGE } from '../../../../test/deals';

const NOW = '2026-10-09T12:00:00.000Z';
const CLOSED_AT = '2026-10-08T10:00:00.000Z';

const FIRST = makeDeal(1, { stage: NEW_STAGE, amount: 100000, currency: 'USD' });
const SECOND = makeDeal(2, { stage: NEW_STAGE, amount: 50000, currency: 'EUR' });
const THIRD = makeDeal(3, { stage: NEW_STAGE, amount: 20000, currency: 'USD' });
const CALLED = makeDeal(4, { stage: CALL_STAGE, amount: 30000, currency: 'USD' });
const WON = makeDeal(5, { stage: WON_STAGE, closedAt: CLOSED_AT, currency: 'USD' });

const BOARD = makeBoard([FIRST, SECOND, THIRD, CALLED, WON]);

function columnOf(board: Board, stageId: string): Board['columns'][number] {
  const column = board.columns.find((item) => item.stage.id === stageId);
  if (column === undefined) {
    throw new Error(`No column ${stageId}`);
  }
  return column;
}

function idsIn(board: Board, stageId: string): string[] {
  return columnOf(board, stageId).deals.map((deal) => deal.id);
}

describe('applyMove', () => {
  it('should put the card after afterId when it moves within its column', () => {
    const board = applyMove(
      BOARD,
      { dealId: FIRST.id, stageId: NEW_STAGE.id, afterId: THIRD.id },
      NOW,
    );

    expect(idsIn(board, NEW_STAGE.id)).toEqual([SECOND.id, THIRD.id, FIRST.id]);
    expect(columnOf(board, NEW_STAGE.id).count).toBe(3);
    expect(columnOf(board, NEW_STAGE.id).totals).toEqual(columnOf(BOARD, NEW_STAGE.id).totals);
  });

  it('should move the card and its money when it goes to another column', () => {
    const board = applyMove(
      BOARD,
      { dealId: FIRST.id, stageId: CALL_STAGE.id, afterId: CALLED.id },
      NOW,
    );

    expect(idsIn(board, NEW_STAGE.id)).toEqual([SECOND.id, THIRD.id]);
    expect(idsIn(board, CALL_STAGE.id)).toEqual([CALLED.id, FIRST.id]);
    expect(columnOf(board, NEW_STAGE.id)).toMatchObject({
      count: 2,
      totals: [
        { currency: 'USD', amount: 20000, count: 1 },
        { currency: 'EUR', amount: 50000, count: 1 },
      ],
    });
    expect(columnOf(board, CALL_STAGE.id)).toMatchObject({
      count: 2,
      totals: [{ currency: 'USD', amount: 130000, count: 2 }],
    });
  });

  it('should put the card first when afterId is null', () => {
    const board = applyMove(
      BOARD,
      { dealId: CALLED.id, stageId: NEW_STAGE.id, afterId: null },
      NOW,
    );

    expect(idsIn(board, NEW_STAGE.id)).toEqual([CALLED.id, FIRST.id, SECOND.id, THIRD.id]);
  });

  it('should put the card first with closedAt set when it enters a closed column', () => {
    const board = applyMove(BOARD, { dealId: FIRST.id, stageId: WON_STAGE.id, afterId: null }, NOW);

    const won = columnOf(board, WON_STAGE.id);
    expect(won.deals.map((deal) => deal.id)).toEqual([FIRST.id, WON.id]);
    expect(won.deals[0]?.closedAt).toBe(NOW);
  });

  it('should ignore afterId when the target column is closed', () => {
    const board = applyMove(
      BOARD,
      { dealId: FIRST.id, stageId: WON_STAGE.id, afterId: WON.id },
      NOW,
    );

    expect(idsIn(board, WON_STAGE.id)).toEqual([FIRST.id, WON.id]);
  });

  it('should clear closedAt when the card leaves a closed column for an open one', () => {
    const board = applyMove(BOARD, { dealId: WON.id, stageId: CALL_STAGE.id, afterId: null }, NOW);

    expect(columnOf(board, CALL_STAGE.id).deals[0]).toMatchObject({ id: WON.id, closedAt: null });
  });

  it('should drop a total when its count reaches zero', () => {
    const board = applyMove(
      BOARD,
      { dealId: SECOND.id, stageId: CALL_STAGE.id, afterId: null },
      NOW,
    );

    expect(columnOf(board, NEW_STAGE.id).totals).toEqual([
      { currency: 'USD', amount: 120000, count: 2 },
    ]);
    expect(columnOf(board, CALL_STAGE.id).totals).toEqual([
      { currency: 'USD', amount: 30000, count: 1 },
      { currency: 'EUR', amount: 50000, count: 1 },
    ]);
  });

  it('should keep the totals in the server currency order when a currency joins the column', () => {
    const euros = makeDeal(6, { stage: CALL_STAGE, amount: 40000, currency: 'EUR' });

    const board = applyMove(
      makeBoard([FIRST, euros]),
      { dealId: FIRST.id, stageId: CALL_STAGE.id, afterId: null },
      NOW,
    );

    expect(columnOf(board, CALL_STAGE.id).totals).toEqual([
      { currency: 'USD', amount: 100000, count: 1 },
      { currency: 'EUR', amount: 40000, count: 1 },
    ]);
  });

  it('should return the board unchanged when the card is not on it', () => {
    const board = applyMove(
      BOARD,
      { dealId: makeDeal(99).id, stageId: CALL_STAGE.id, afterId: null },
      NOW,
    );

    expect(board).toBe(BOARD);
  });
});

describe('revertMove', () => {
  it('should put back only that card when another card moved after it', () => {
    const moved = applyMove(
      BOARD,
      { dealId: FIRST.id, stageId: CALL_STAGE.id, afterId: CALLED.id },
      NOW,
    );
    const later = applyMove(
      moved,
      { dealId: SECOND.id, stageId: CALL_STAGE.id, afterId: null },
      NOW,
    );

    const board = revertMove(later, BOARD, FIRST.id);

    expect(idsIn(board, NEW_STAGE.id)).toEqual([FIRST.id, THIRD.id]);
    expect(idsIn(board, CALL_STAGE.id)).toEqual([SECOND.id, CALLED.id]);
    expect(columnOf(board, NEW_STAGE.id)).toMatchObject({
      count: 2,
      totals: [{ currency: 'USD', amount: 120000, count: 2 }],
    });
  });

  it('should give closedAt back when the card returns to a closed column', () => {
    const moved = applyMove(BOARD, { dealId: WON.id, stageId: CALL_STAGE.id, afterId: null }, NOW);

    const board = revertMove(moved, BOARD, WON.id);

    expect(columnOf(board, WON_STAGE.id).deals).toEqual(columnOf(BOARD, WON_STAGE.id).deals);
  });

  it('should keep the current version when an earlier move bumped it', () => {
    const moved = applyMove(
      BOARD,
      { dealId: FIRST.id, stageId: CALL_STAGE.id, afterId: null },
      NOW,
    );
    const answered = withServerDeal(moved, { ...FIRST, stage: CALL_STAGE, version: 9 });

    const board = revertMove(answered, BOARD, FIRST.id);

    expect(columnOf(board, NEW_STAGE.id).deals[0]).toMatchObject({ id: FIRST.id, version: 9 });
  });

  it('should return the board unchanged when the earlier board did not have the card', () => {
    const board = revertMove(BOARD, makeBoard([]), FIRST.id);

    expect(board).toBe(BOARD);
  });
});

describe('withServerDeal', () => {
  it('should replace the card fields and version in place when the server answers', () => {
    const board = withServerDeal(BOARD, { ...CALLED, title: 'Renamed', version: 9 });

    expect(columnOf(board, CALL_STAGE.id).deals[0]).toMatchObject({ title: 'Renamed', version: 9 });
  });
});
