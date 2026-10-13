import type { MemberFilter } from '@clientry/shared/workspaces';

export interface BoardFilters {
  // Null for anyone.
  readonly assignee: MemberFilter | null;
}
