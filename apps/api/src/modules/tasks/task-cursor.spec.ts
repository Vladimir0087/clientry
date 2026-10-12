import { describe, expect, it } from 'vitest';

import { decodeTaskCursor, encodeTaskCursor } from './task-cursor.js';
import type { TaskCursor } from './task-cursor.js';

const ID = '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a';
const DUE_AT = '2026-10-15T12:00:00.000Z';
const DONE_AT = '2026-10-14T08:30:00.000Z';

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('task cursor', () => {
  it.each<TaskCursor>([
    { status: 'open', dueAt: DUE_AT, id: ID },
    { status: 'done', doneAt: DONE_AT, dueAt: DUE_AT, id: ID },
  ])('should decode what it encoded when the status is $status', (cursor) => {
    expect(decodeTaskCursor(encodeTaskCursor(cursor), cursor.status)).toEqual(cursor);
  });

  it('should return null when the cursor was made for the other status', () => {
    const cursor = encodeTaskCursor({ status: 'open', dueAt: DUE_AT, id: ID });

    expect(decodeTaskCursor(cursor, 'done')).toBeNull();
  });

  it.each([
    ['broken base64', '!!!'],
    ['not JSON', Buffer.from('not json').toString('base64url')],
    ['a forged shape', encodeJson(['open', 'yesterday', ID])],
    ['an extra element', encodeJson(['open', DUE_AT, ID, ID])],
    ['a done tuple without dueAt', encodeJson(['done', DONE_AT, ID])],
  ])('should return null when the cursor is %s', (_case, raw) => {
    expect(decodeTaskCursor(raw, 'open')).toBeNull();
    expect(decodeTaskCursor(raw, 'done')).toBeNull();
  });
});
