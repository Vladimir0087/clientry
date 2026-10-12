import { CURRENCIES } from '@clientry/shared/deals';
import type { Board, BoardColumn, CurrencyTotal, Deal, DealCard } from '@clientry/shared/deals';

import { isClosedStage } from './stage-kind';

export interface MoveDealVariables {
  readonly dealId: string;
  readonly stageId: string;
  // The visible deal the card goes right after, or null for the top; closed stages ignore it.
  readonly afterId: string | null;
}

function byCurrencyOrder(a: CurrencyTotal, b: CurrencyTotal): number {
  return CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency);
}

function changeTotals(
  totals: readonly CurrencyTotal[],
  card: DealCard,
  sign: 1 | -1,
): CurrencyTotal[] {
  const existing = totals.find((total) => total.currency === card.currency);
  const next =
    existing === undefined
      ? [...totals, { currency: card.currency, amount: 0, count: 0 }]
      : [...totals];
  // In the server's order, so its refetch does not swap the totals around.
  return next
    .map((total) =>
      total.currency === card.currency
        ? { ...total, amount: total.amount + sign * card.amount, count: total.count + sign }
        : total,
    )
    .filter((total) => total.count > 0)
    .toSorted(byCurrencyOrder);
}

function insertAt(deals: readonly DealCard[], card: DealCard, afterId: string | null): DealCard[] {
  const afterIndex = afterId === null ? -1 : deals.findIndex((deal) => deal.id === afterId);
  return [...deals.slice(0, afterIndex + 1), card, ...deals.slice(afterIndex + 1)];
}

function findCard(board: Board, dealId: string): DealCard | undefined {
  for (const column of board.columns) {
    const card = column.deals.find((deal) => deal.id === dealId);
    if (card !== undefined) {
      return card;
    }
  }
  return undefined;
}

function placeCard(board: Board, card: DealCard, stageId: string, afterId: string | null): Board {
  const columns = board.columns.map((column): BoardColumn => {
    const current = column.deals.find((deal) => deal.id === card.id);
    const isTarget = column.stage.id === stageId;
    if (current === undefined && !isTarget) {
      return column;
    }
    const rest = column.deals.filter((deal) => deal.id !== card.id);
    if (isTarget) {
      return {
        ...column,
        deals: insertAt(rest, card, afterId),
        count: current === undefined ? column.count + 1 : column.count,
        totals: current === undefined ? changeTotals(column.totals, card, 1) : column.totals,
      };
    }
    return {
      ...column,
      deals: rest,
      count: column.count - 1,
      totals: changeTotals(column.totals, current ?? card, -1),
    };
  });
  return { columns };
}

// What the server will do, done to the cached board before it answers.
export function applyMove(board: Board, move: MoveDealVariables, now: string): Board {
  const card = findCard(board, move.dealId);
  const target = board.columns.find((column) => column.stage.id === move.stageId);
  if (card === undefined || target === undefined) {
    return board;
  }
  const isTargetClosed = isClosedStage(target.stage.kind);
  const isSameColumn = target.deals.some((deal) => deal.id === move.dealId);
  const closedAt = isTargetClosed ? (isSameColumn ? card.closedAt : now) : null;
  return placeCard(
    board,
    { ...card, closedAt },
    move.stageId,
    isTargetClosed ? null : move.afterId,
  );
}

// Only this card goes back to where the earlier board had it; cards moved since stay put.
export function revertMove(board: Board, before: Board, dealId: string): Board {
  const current = findCard(board, dealId);
  for (const column of before.columns) {
    const index = column.deals.findIndex((deal) => deal.id === dealId);
    const card = column.deals[index];
    if (current !== undefined && card !== undefined) {
      // Current fields: an earlier move may have bumped the version since that board.
      const restored = { ...current, closedAt: card.closedAt };
      return placeCard(board, restored, column.stage.id, column.deals[index - 1]?.id ?? null);
    }
  }
  return board;
}

// The server's answer replaces the card's fields, its new version included, where it stands.
export function withServerDeal(board: Board, deal: Deal): Board {
  const columns = board.columns.map((column) => ({
    ...column,
    deals: column.deals.map((card) =>
      card.id === deal.id
        ? {
            id: deal.id,
            title: deal.title,
            amount: deal.amount,
            currency: deal.currency,
            client: deal.client,
            assignee: deal.assignee,
            closedAt: deal.closedAt,
            version: deal.version,
          }
        : card,
    ),
  }));
  return { columns };
}

export function cardVersion(board: Board, dealId: string): number | undefined {
  return findCard(board, dealId)?.version;
}
