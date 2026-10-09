import type { ClientSort, ClientSource } from '@clientry/shared/clients';

export interface ClientFilters {
  readonly q: string;
  readonly sources: readonly ClientSource[];
  readonly tags: readonly string[];
  readonly isMine: boolean;
  readonly sort: ClientSort;
}

export const DEFAULT_CLIENT_FILTERS: ClientFilters = {
  q: '',
  sources: [],
  tags: [],
  isMine: false,
  sort: 'newest',
};

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].toSorted();
}

// One shape per meaning, so equal filters share one cache entry and one request.
export function normalizeClientFilters(filters: ClientFilters): ClientFilters {
  return {
    q: filters.q.trim(),
    sources: sortedUnique(filters.sources),
    tags: sortedUnique(filters.tags),
    isMine: filters.isMine,
    sort: filters.sort,
  };
}

// The sort orders the list but does not narrow it.
export function hasActiveFilters(filters: ClientFilters): boolean {
  return (
    filters.q !== '' || filters.sources.length > 0 || filters.tags.length > 0 || filters.isMine
  );
}
