import { useQueryStates } from 'nuqs';

import type { BoardFilters } from '@/entities/deal';

import { boardFilterParsers, toBoardFilters } from './board-filter-parsers';

// Shallow: a filter change refetches through Query without rendering the server page again.
const URL_OPTIONS = { history: 'replace', shallow: true } as const;

export interface BoardFiltersState {
  readonly filters: BoardFilters;
  readonly setMine: (isMine: boolean) => void;
}

export function useBoardFilters(): BoardFiltersState {
  const [values, setValues] = useQueryStates(boardFilterParsers, URL_OPTIONS);
  return {
    filters: toBoardFilters(values),
    // Off is left out of the URL rather than written as false.
    setMine: (isMine) => {
      void setValues({ mine: isMine ? true : null });
    },
  };
}
