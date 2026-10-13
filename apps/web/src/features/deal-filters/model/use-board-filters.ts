import { useQueryStates } from 'nuqs';

import type { BoardFilters } from '@/entities/deal';
import type { MemberFilter } from '@clientry/shared/workspaces';

import { boardFilterParsers, toBoardFilters } from './board-filter-parsers';

// Shallow: a filter change refetches through Query without rendering the server page again.
const URL_OPTIONS = { history: 'replace', shallow: true } as const;

export interface BoardFiltersState {
  readonly filters: BoardFilters;
  readonly setAssignee: (assignee: MemberFilter | null) => void;
}

// Anyone is left out of the URL.
export function useBoardFilters(): BoardFiltersState {
  const [values, setValues] = useQueryStates(boardFilterParsers, URL_OPTIONS);
  return {
    filters: toBoardFilters(values),
    setAssignee: (assignee) => {
      void setValues({ assignee });
    },
  };
}
