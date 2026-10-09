import type { Route } from 'next';

export const CLIENTS_PATH = '/clients';
export const NEW_CLIENT_PATH = '/clients/new';

// Typed routes check a template only against a literal id, so a runtime id needs the cast.
export function clientPath(id: string): Route {
  return `/clients/${id}` as Route;
}

export function editClientPath(id: string): Route {
  return `/clients/${id}/edit` as Route;
}
