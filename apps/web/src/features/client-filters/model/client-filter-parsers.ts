import { createLoader, createParser, parseAsStringLiteral } from 'nuqs/server';
import type { SearchParams, SingleParserBuilder } from 'nuqs/server';

import { normalizeClientFilters } from '@/entities/client';
import type { ClientFilters } from '@/entities/client';
import { memberFilterParser } from '@/entities/member';
import {
  CLIENT_LIMITS,
  clientSortSchema,
  clientSourceSchema,
  clientTagSchema,
} from '@clientry/shared/clients';
import type { ClientSource } from '@clientry/shared/clients';
import { textSchema } from '@clientry/shared/common';
import type { MemberFilter } from '@clientry/shared/workspaces';

const SEPARATOR = ',';

function parseSource(raw: string): ClientSource | null {
  const result = clientSourceSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function parseTag(raw: string): string | null {
  const result = clientTagSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function isSameList(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

// Values the API would reject are dropped, so a hand-edited URL filters less instead of failing.
function listParser<T extends string>(
  parseItem: (raw: string) => T | null,
  max: number,
): SingleParserBuilder<T[]> {
  return createParser<T[]>({
    parse: (query) => {
      const items = query.split(SEPARATOR).map(parseItem);
      return [...new Set(items.filter((item) => item !== null))].slice(0, max);
    },
    serialize: (values) => values.join(SEPARATOR),
    eq: isSameList,
  });
}

const searchParser = createParser<string>({
  parse: (query) => {
    const value = query.slice(0, CLIENT_LIMITS.search);
    return textSchema.safeParse(value).success ? value : null;
  },
  serialize: (value) => value,
});

// Imported from nuqs/server, which has no 'use client', so the server page parses the same way.
export const clientFilterParsers = {
  q: searchParser.withDefault(''),
  source: listParser(parseSource, CLIENT_LIMITS.sources).withDefault([]),
  tags: listParser(parseTag, CLIENT_LIMITS.tags).withDefault([]),
  createdBy: memberFilterParser,
  sort: parseAsStringLiteral(clientSortSchema.options).withDefault('newest'),
};

export interface ClientFilterValues {
  readonly q: string;
  readonly source: readonly ClientSource[];
  readonly tags: readonly string[];
  readonly createdBy: MemberFilter | null;
  readonly sort: ClientFilters['sort'];
}

export function toClientFilters(values: ClientFilterValues): ClientFilters {
  return normalizeClientFilters({
    q: values.q,
    sources: values.source,
    tags: values.tags,
    createdBy: values.createdBy,
    sort: values.sort,
  });
}

const loadFilterValues = createLoader(clientFilterParsers);

export async function loadClientFilters(
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<ClientFilters> {
  return toClientFilters(loadFilterValues(await searchParams));
}
