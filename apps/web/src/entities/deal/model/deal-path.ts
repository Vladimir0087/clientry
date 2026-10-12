import type { Route } from 'next';

export const DEALS_PATH = '/deals';
export const STAGES_PATH = '/deals/stages';

interface NewDealDefaults {
  readonly stageId?: string;
  readonly clientId?: string;
}

// Typed routes check a template only against a literal id, so a runtime id needs the cast.
export function dealPath(id: string): Route {
  return `/deals/${id}` as Route;
}

export function editDealPath(id: string): Route {
  return `/deals/${id}/edit` as Route;
}

export function newDealPath({ stageId, clientId }: NewDealDefaults = {}): Route {
  const params = new URLSearchParams();
  if (stageId !== undefined) {
    params.set('stageId', stageId);
  }
  if (clientId !== undefined) {
    params.set('clientId', clientId);
  }
  const query = params.toString();
  if (query === '') {
    return '/deals/new';
  }
  return `/deals/new?${query}` as Route;
}
