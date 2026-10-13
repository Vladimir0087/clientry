import { createLoader, createParser } from 'nuqs/server';
import type { SearchParams } from 'nuqs/server';

import { ANYONE, taskMemberFilterParser } from '@/entities/member';
import type { TaskFilters } from '@/entities/task';

// Any status other than done reads as the default.
const statusParser = createParser<'done'>({
  parse: (query) => (query === 'done' ? 'done' : null),
  serialize: () => 'done',
});

// Imported from nuqs/server, which has no 'use client', so the server page parses the same way.
export const taskFilterParsers = {
  assignee: taskMemberFilterParser.withDefault('me'),
  status: statusParser,
};

interface TaskFilterValues {
  // "anyone", "me" or a member id.
  readonly assignee: string;
  readonly status: 'done' | null;
}

export function toTaskFilters(values: TaskFilterValues): TaskFilters {
  return {
    assignee: values.assignee === ANYONE ? null : values.assignee,
    status: values.status === 'done' ? 'done' : 'open',
  };
}

const loadFilterValues = createLoader(taskFilterParsers);

export async function loadTaskFilters(
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<TaskFilters> {
  return toTaskFilters(loadFilterValues(await searchParams));
}
