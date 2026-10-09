import { describe, expect, it } from 'vitest';

import type { ClientSort } from '@clientry/shared/clients';

import { decodeClientCursor, encodeClientCursor } from './client-cursor.js';
import type { ClientCursor } from './client-cursor.js';

const ID = '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('client cursor', () => {
  it.each<ClientCursor>([
    { sort: 'newest', value: '2026-10-08T09:30:00.000Z', id: ID },
    { sort: 'oldest', value: '2026-10-08T09:30:00.000Z', id: ID },
    { sort: 'name_asc', value: 'Ромашка "Lux"', id: ID },
    { sort: 'name_desc', value: 'Romashka', id: ID },
  ])('should decode what it encoded when the sort is $sort', (cursor) => {
    expect(decodeClientCursor(encodeClientCursor(cursor), cursor.sort)).toEqual(cursor);
  });

  it.each<[string, string, ClientSort]>([
    ['is not base64url', 'not base64url!', 'newest'],
    ['is not JSON', Buffer.from('{oops').toString('base64url'), 'newest'],
    ['is a wrong tuple', encodeJson(['newest', '2026-10-08T09:30:00.000Z']), 'newest'],
    ['has an unknown sort', encodeJson(['random', 'x', ID]), 'newest'],
    ['has a date sort without a date', encodeJson(['newest', 'yesterday', ID]), 'newest'],
    ['was made for another sort', encodeJson(['name_asc', 'Romashka', ID]), 'newest'],
  ])('should return null when the cursor %s', (_case, raw, sort) => {
    expect(decodeClientCursor(raw, sort)).toBeNull();
  });
});
