import type { TaskStatus } from '@clientry/shared/tasks';

// clientId and dealId narrow a list to one card's or page's tasks; at most one is set.
export interface TaskFilters {
  readonly isMine: boolean;
  readonly status: TaskStatus;
  readonly clientId?: string;
  readonly dealId?: string;
}
