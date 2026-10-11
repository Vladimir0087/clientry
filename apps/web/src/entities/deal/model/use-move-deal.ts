import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { hasErrorCode, isNotFound } from '@/shared/api/api-status';
import type { Board, Deal } from '@clientry/shared/deals';

import { applyMove, cardVersion, revertMove, withServerDeal } from './apply-move';
import type { MoveDealVariables } from './apply-move';
import { dealKeys, stageKeys } from './deal-keys';
import { moveDeal } from '../api/deal-api';

const MOVE_KEY = ['deals', 'move'];
// One scope: moves run one at a time, so each sends the version the previous one returned.
const MOVE_SCOPE = { id: 'move-deal' };
// One toast however many queued moves fail together.
const MOVE_ERROR_TOAST = 'move-deal-error';

type MoveSurface = 'board' | 'page';

const CHANGED_MESSAGES: Readonly<Record<MoveSurface, string>> = {
  board: 'This deal was changed by someone else. The board is updated.',
  page: 'This deal was changed by someone else. The page is updated.',
};

interface MoveContext {
  readonly snapshot: readonly (readonly [QueryKey, Board | undefined])[];
}

export function moveErrorMessage(error: unknown, surface: MoveSurface): string {
  if (hasErrorCode(error, 'DEAL_CHANGED')) {
    return CHANGED_MESSAGES[surface];
  }
  if (hasErrorCode(error, 'BOARD_CHANGED')) {
    return 'The board changed. Try again.';
  }
  if (isNotFound(error)) {
    return 'This deal no longer exists.';
  }
  return 'Could not move the deal. Try again.';
}

export function hasPendingMove(queryClient: QueryClient): boolean {
  return queryClient.isMutating({ mutationKey: MOVE_KEY }) > 0;
}

function isMoveOf(variables: unknown, dealId: string): boolean {
  return (
    typeof variables === 'object' &&
    variables !== null &&
    'dealId' in variables &&
    variables.dealId === dealId
  );
}

// Counts the failing move too: it stays pending while its onError runs.
function hasLaterMoveOf(queryClient: QueryClient, dealId: string): boolean {
  const moves = queryClient.getMutationCache().findAll({
    mutationKey: MOVE_KEY,
    status: 'pending',
    predicate: (mutation) => isMoveOf(mutation.state.variables, dealId),
  });
  return moves.length > 1;
}

function revertCard(queryClient: QueryClient, dealId: string, context?: MoveContext): void {
  for (const [key, before] of context?.snapshot ?? []) {
    queryClient.setQueryData<Board>(key, (board) =>
      board === undefined || before === undefined ? board : revertMove(board, before, dealId),
    );
  }
}

// Read when the request starts, not when it was queued: the previous move may have bumped it.
function currentVersion(queryClient: QueryClient, dealId: string): number | undefined {
  const versions = queryClient
    .getQueriesData<Board>({ queryKey: dealKeys.boards })
    .map(([, board]) => (board === undefined ? undefined : cardVersion(board, dealId)));
  versions.push(queryClient.getQueryData<Deal>(dealKeys.detail(dealId))?.version);
  const known = versions.filter((version) => version !== undefined);
  return known.length === 0 ? undefined : Math.max(...known);
}

function storeMovedDeal(queryClient: QueryClient, deal: Deal): void {
  queryClient.setQueriesData<Board>({ queryKey: dealKeys.boards }, (board) =>
    board === undefined ? board : withServerDeal(board, deal),
  );
  queryClient.setQueryData(dealKeys.detail(deal.id), deal);
  void queryClient.invalidateQueries({ queryKey: dealKeys.history(deal.id) });
  void queryClient.invalidateQueries({ queryKey: dealKeys.byClient(deal.client.id) });
}

export function useMoveDeal(
  surface: MoveSurface,
): UseMutationResult<Deal, Error, MoveDealVariables, MoveContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MOVE_KEY,
    scope: MOVE_SCOPE,
    mutationFn: ({ dealId, stageId, afterId }: MoveDealVariables) => {
      const version = currentVersion(queryClient, dealId);
      if (version === undefined) {
        return Promise.reject(new Error(`No cached version for deal ${dealId}`));
      }
      return moveDeal(dealId, { version, stageId, afterId });
    },
    // The board changes before the first await, so a drop never shows the card back in place;
    // a manual write survives the cancel, which reverts only to the last written state.
    onMutate: async (move) => {
      const snapshot = queryClient.getQueriesData<Board>({ queryKey: dealKeys.boards });
      const now = new Date().toISOString();
      queryClient.setQueriesData<Board>({ queryKey: dealKeys.boards }, (board) =>
        board === undefined ? board : applyMove(board, move, now),
      );
      await queryClient.cancelQueries({ queryKey: dealKeys.boards });
      return { snapshot };
    },
    // Only the failed card goes back, unless a queued move of it decides where it stands.
    onError: (error, { dealId }, context) => {
      if (!hasLaterMoveOf(queryClient, dealId)) {
        revertCard(queryClient, dealId, context);
      }
      // The deal page reads the version from the detail, which the board refetch leaves alone.
      void queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
      void queryClient.invalidateQueries({ queryKey: dealKeys.history(dealId) });
      toast.error(moveErrorMessage(error, surface), { id: MOVE_ERROR_TOAST });
    },
    onSuccess: (deal) => {
      storeMovedDeal(queryClient, deal);
    },
    // A refetch while another move waits would overwrite that move's optimistic card. Awaited, so
    // mutateAsync settles on the refetched board; the stages show deal counts.
    onSettled: async () => {
      void queryClient.invalidateQueries({ queryKey: stageKeys.all });
      if (queryClient.isMutating({ mutationKey: MOVE_KEY }) <= 1) {
        await queryClient.invalidateQueries({ queryKey: dealKeys.boards });
      }
    },
  });
}
