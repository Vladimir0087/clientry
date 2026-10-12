import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Board } from '@clientry/shared/deals';

import type { BoardFilters } from './board-filters';
import { dealKeys } from './deal-keys';
import { hasPendingMove } from './use-move-deal';
import { fetchBoard } from '../api/deal-api';

// The old board stays on screen while the board for a new filter loads.
export function useBoard(filters: BoardFilters): UseQueryResult<Board> {
  const queryClient = useQueryClient();
  // An answer read before a pending move commits would put its card back.
  const isIdle = (): boolean => !hasPendingMove(queryClient);
  return useQuery({
    queryKey: dealKeys.board(filters),
    queryFn: ({ signal }) => fetchBoard(filters, signal),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: isIdle,
    refetchOnReconnect: isIdle,
  });
}
