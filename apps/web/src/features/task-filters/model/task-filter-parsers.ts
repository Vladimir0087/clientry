import { createLoader, createParser } from 'nuqs/server';
import type { SearchParams } from 'nuqs/server';

import type { TaskFilters } from '@/entities/task';

// Each parameter has one value besides its default; any other value reads as the default.
function exactParser<T extends string>(value: T): ReturnType<typeof createParser<T>> {
  return createParser<T>({
    parse: (query) => (query === value ? value : null),
    serialize: () => value,
  });
}

// Imported from nuqs/server, which has no 'use client', so the server page parses the same way.
export const taskFilterParsers = {
  assignee: exactParser('anyone'),
  status: exactParser('done'),
};

interface TaskFilterValues {
  readonly assignee: 'anyone' | null;
  readonly status: 'done' | null;
}

export function toTaskFilters(values: TaskFilterValues): TaskFilters {
  return {
    isMine: values.assignee !== 'anyone',
    status: values.status === 'done' ? 'done' : 'open',
  };
}

const loadFilterValues = createLoader(taskFilterParsers);

export async function loadTaskFilters(
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<TaskFilters> {
  return toTaskFilters(loadFilterValues(await searchParams));
}
