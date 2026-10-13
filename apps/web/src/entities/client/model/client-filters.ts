import type { ClientSort, ClientSource } from '@clientry/shared/clients';
import type { MemberFilter } from '@clientry/shared/workspaces';

export interface ClientFilters {
  readonly q: string;
  readonly sources: readonly ClientSource[];
  readonly tags: readonly string[];
  // Null for anyone.
  readonly createdBy: MemberFilter | null;
  readonly sort: ClientSort;
}

export const DEFAULT_CLIENT_FILTERS: ClientFilters = {
  q: '',
  sources: [],
  tags: [],
  createdBy: null,
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
    createdBy: filters.createdBy,
    sort: filters.sort,
  };
}

// The sort orders the list but does not narrow it.
export function hasActiveFilters(filters: ClientFilters): boolean {
  return (
    filters.q !== '' ||
    filters.sources.length > 0 ||
    filters.tags.length > 0 ||
    filters.createdBy !== null
  );
}
