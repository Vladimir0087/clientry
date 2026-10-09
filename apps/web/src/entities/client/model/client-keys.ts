import type { ClientFilters } from './client-filters';

export const clientKeys = {
  all: ['clients'],
  lists: ['clients', 'list'],
  list: (filters: ClientFilters) => ['clients', 'list', filters] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  tags: ['clients', 'tags'],
} as const;
