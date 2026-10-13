import { createLoader } from 'nuqs/server';
import type { SearchParams } from 'nuqs/server';

import type { BoardFilters } from '@/entities/deal';
import { memberFilterParser } from '@/entities/member';
import type { MemberFilter } from '@clientry/shared/workspaces';

// Imported from nuqs/server, which has no 'use client', so the server page parses the same way.
export const boardFilterParsers = {
  assignee: memberFilterParser,
};

export function toBoardFilters(values: { readonly assignee: MemberFilter | null }): BoardFilters {
  return { assignee: values.assignee };
}

const loadFilterValues = createLoader(boardFilterParsers);

export async function loadBoardFilters(
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<BoardFilters> {
  return toBoardFilters(loadFilterValues(await searchParams));
}
