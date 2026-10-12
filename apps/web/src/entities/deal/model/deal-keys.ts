import type { BoardFilters } from './board-filters';

export const dealKeys = {
  all: ['deals'],
  boards: ['deals', 'board'],
  board: (filters: BoardFilters) => ['deals', 'board', filters] as const,
  detail: (id: string) => ['deals', 'detail', id] as const,
  history: (id: string) => ['deals', 'history', id] as const,
  clientLists: ['deals', 'client'],
  byClient: (clientId: string) => ['deals', 'client', clientId] as const,
} as const;

export const stageKeys = {
  all: ['stages'],
  list: ['stages', 'list'],
} as const;
