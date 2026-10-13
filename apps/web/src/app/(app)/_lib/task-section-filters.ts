import type { TaskFilters } from '@/entities/task';

export type TaskSectionOwner = { readonly clientId: string } | { readonly dealId: string };

// The open tasks of a client card or a deal page; the page prefetch and the section share it.
export function taskSectionFilters(owner: TaskSectionOwner): TaskFilters {
  return { assignee: null, status: 'open', ...owner };
}
