import { useQueryStates } from 'nuqs';

import type { TaskFilters } from '@/entities/task';
import type { TaskStatus } from '@clientry/shared/tasks';

import { taskFilterParsers, toTaskFilters } from './task-filter-parsers';

// Shallow: a filter change refetches through Query without rendering the server page again.
const URL_OPTIONS = { history: 'replace', shallow: true } as const;

export interface TaskFiltersState {
  readonly filters: TaskFilters;
  readonly setMine: (isMine: boolean) => void;
  readonly setStatus: (status: TaskStatus) => void;
}

// Defaults are left out of the URL.
export function useTaskFilters(): TaskFiltersState {
  const [values, setValues] = useQueryStates(taskFilterParsers, URL_OPTIONS);
  return {
    filters: toTaskFilters(values),
    setMine: (isMine) => {
      void setValues({ assignee: isMine ? null : 'anyone' });
    },
    setStatus: (status) => {
      void setValues({ status: status === 'done' ? 'done' : null });
    },
  };
}
