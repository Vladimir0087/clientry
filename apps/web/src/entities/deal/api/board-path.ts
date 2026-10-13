import type { ApiPath } from '@/shared/api/api-path';

import type { BoardFilters } from '../model/board-filters';

// The browser and the server prefetch build the URL here, so both ask for the same board.
export function boardPath(filters: BoardFilters): ApiPath {
  if (filters.assignee === null) {
    return '/api/deals/board';
  }
  return `/api/deals/board?${new URLSearchParams({ assignee: filters.assignee }).toString()}`;
}
