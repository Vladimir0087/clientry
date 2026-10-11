import { createLoader, createParser } from 'nuqs/server';
import type { SearchParams } from 'nuqs/server';

import type { BoardFilters } from '@/entities/deal';

// Only the exact "true" turns the filter on; any other value reads as off.
const mineParser = createParser<boolean>({
  parse: (query) => (query === 'true' ? true : null),
  serialize: () => 'true',
});

// Imported from nuqs/server, which has no 'use client', so the server page parses the same way.
export const boardFilterParsers = {
  mine: mineParser.withDefault(false),
};

export function toBoardFilters(values: { readonly mine: boolean }): BoardFilters {
  return { isMine: values.mine };
}

const loadFilterValues = createLoader(boardFilterParsers);

export async function loadBoardFilters(
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<BoardFilters> {
  return toBoardFilters(loadFilterValues(await searchParams));
}
