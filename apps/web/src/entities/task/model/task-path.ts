import type { Route } from 'next';

export const TASKS_PATH = '/tasks';

interface NewTaskDefaults {
  readonly clientId?: string;
  readonly dealId?: string;
}

// Typed routes check a template only against a literal id, so a runtime id needs the cast.
export function taskPath(id: string): Route {
  return `/tasks/${id}` as Route;
}

export function editTaskPath(id: string): Route {
  return `/tasks/${id}/edit` as Route;
}

export function newTaskPath({ clientId, dealId }: NewTaskDefaults = {}): Route {
  if (dealId !== undefined) {
    return `/tasks/new?${new URLSearchParams({ dealId }).toString()}` as Route;
  }
  if (clientId !== undefined) {
    return `/tasks/new?${new URLSearchParams({ clientId }).toString()}` as Route;
  }
  return '/tasks/new';
}
