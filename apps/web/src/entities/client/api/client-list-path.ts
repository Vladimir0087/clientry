import type { ApiPath } from '@/shared/api/api-path';
import { CLIENT_LIMITS } from '@clientry/shared/clients';

import { DEFAULT_CLIENT_FILTERS } from '../model/client-filters';
import type { ClientFilters } from '../model/client-filters';

// Defaults are left out and the limit is always sent; the browser and the server prefetch share it.
export function clientListPath(filters: ClientFilters, cursor: string | null): ApiPath {
  const params = new URLSearchParams();
  if (filters.q !== '') {
    params.set('q', filters.q);
  }
  for (const source of filters.sources) {
    params.append('source', source);
  }
  for (const tag of filters.tags) {
    params.append('tag', tag);
  }
  if (filters.createdBy !== null) {
    params.set('createdBy', filters.createdBy);
  }
  if (filters.sort !== DEFAULT_CLIENT_FILTERS.sort) {
    params.set('sort', filters.sort);
  }
  if (cursor !== null) {
    params.set('cursor', cursor);
  }
  params.set('limit', String(CLIENT_LIMITS.defaultPageSize));
  return `/api/clients?${params.toString()}`;
}
