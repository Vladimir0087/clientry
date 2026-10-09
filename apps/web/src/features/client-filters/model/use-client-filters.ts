import { useQueryStates } from 'nuqs';

import { hasActiveFilters } from '@/entities/client';
import type { ClientFilters } from '@/entities/client';
import type { ClientSort, ClientSource } from '@clientry/shared/clients';

import { clientFilterParsers, toClientFilters } from './client-filter-parsers';

// Shallow: a filter change refetches through Query without rendering the server page again.
// Replace: Back leaves the list instead of stepping through every keystroke.
const URL_OPTIONS = { history: 'replace', shallow: true } as const;

export interface ClientFiltersState {
  readonly filters: ClientFilters;
  readonly hasActiveFilters: boolean;
  readonly setSearch: (q: string) => void;
  readonly setSources: (sources: readonly ClientSource[]) => void;
  readonly setTags: (tags: readonly string[]) => void;
  readonly setMine: (isMine: boolean) => void;
  readonly setSort: (sort: ClientSort) => void;
  readonly clearFilters: () => void;
}

export function useClientFilters(): ClientFiltersState {
  const [values, setValues] = useQueryStates(clientFilterParsers, URL_OPTIONS);
  const filters = toClientFilters(values);
  return {
    filters,
    hasActiveFilters: hasActiveFilters(filters),
    setSearch: (q) => {
      void setValues({ q: q.trim() });
    },
    setSources: (sources) => {
      void setValues({ source: [...sources].toSorted() });
    },
    setTags: (tags) => {
      void setValues({ tags: [...tags].toSorted() });
    },
    setMine: (isMine) => {
      void setValues({ mine: isMine });
    },
    setSort: (sort) => {
      void setValues({ sort });
    },
    clearFilters: () => {
      void setValues({ q: null, source: null, tags: null, mine: null });
    },
  };
}
