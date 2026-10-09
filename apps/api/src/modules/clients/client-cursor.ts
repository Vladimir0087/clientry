import { z } from 'zod';

import { clientSortSchema } from '@clientry/shared/clients';
import type { ClientSort } from '@clientry/shared/clients';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const cursorTupleSchema = z.tuple([clientSortSchema, z.string(), z.uuid()]);
const dateValueSchema = z.iso.datetime();

// value is created_at as an ISO string for the date sorts and the name for the name sorts.
export interface ClientCursor {
  readonly sort: ClientSort;
  readonly value: string;
  readonly id: string;
}

export function isDateSort(sort: ClientSort): boolean {
  return sort === 'newest' || sort === 'oldest';
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

export function encodeClientCursor({ sort, value, id }: ClientCursor): string {
  return Buffer.from(JSON.stringify([sort, value, id])).toString('base64url');
}

// Null for anything this sort did not produce; Buffer alone would skip invalid characters.
export function decodeClientCursor(raw: string, sort: ClientSort): ClientCursor | null {
  if (!BASE64URL.test(raw)) {
    return null;
  }
  const json = parseJson(Buffer.from(raw, 'base64url').toString('utf8'));
  const tuple = cursorTupleSchema.safeParse(json);
  if (!tuple.success) {
    return null;
  }
  const [cursorSort, value, id] = tuple.data;
  if (cursorSort !== sort) {
    return null;
  }
  if (isDateSort(sort) && !dateValueSchema.safeParse(value).success) {
    return null;
  }
  return { sort, value, id };
}
