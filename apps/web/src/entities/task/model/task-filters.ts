import type { TaskStatus } from '@clientry/shared/tasks';
import type { MemberFilter } from '@clientry/shared/workspaces';

// clientId and dealId narrow a list to one card's or page's tasks; at most one is set.
export interface TaskFilters {
  // Null for anyone.
  readonly assignee: MemberFilter | null;
  readonly status: TaskStatus;
  readonly clientId?: string;
  readonly dealId?: string;
}
