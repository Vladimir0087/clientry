import { useQueryStates } from 'nuqs';

import { ANYONE } from '@/entities/member';
import type { TaskFilters } from '@/entities/task';
import type { TaskStatus } from '@clientry/shared/tasks';
import type { MemberFilter } from '@clientry/shared/workspaces';

import { taskFilterParsers, toTaskFilters } from './task-filter-parsers';

// Shallow: a filter change refetches through Query without rendering the server page again.
const URL_OPTIONS = { history: 'replace', shallow: true } as const;

export interface TaskFiltersState {
  readonly filters: TaskFilters;
  readonly setAssignee: (assignee: MemberFilter | null) => void;
  readonly setStatus: (status: TaskStatus) => void;
}

// Defaults are left out of the URL; the assignee defaults to me, so anyone is written out.
export function useTaskFilters(): TaskFiltersState {
  const [values, setValues] = useQueryStates(taskFilterParsers, URL_OPTIONS);
  return {
    filters: toTaskFilters(values),
    setAssignee: (assignee) => {
      void setValues({ assignee: assignee === 'me' ? null : (assignee ?? ANYONE) });
    },
    setStatus: (status) => {
      void setValues({ status: status === 'done' ? 'done' : null });
    },
  };
}
