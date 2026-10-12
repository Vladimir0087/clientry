import { describe, expect, it } from 'vitest';

import { decodeNotificationCursor, encodeNotificationCursor } from './notification-cursor.js';

const CURSOR = {
  createdAt: '2026-10-15T06:00:01.204Z',
  id: '0199c3b0-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('notification cursor', () => {
  it('should decode what it encoded when the cursor round-trips', () => {
    expect(decodeNotificationCursor(encodeNotificationCursor(CURSOR))).toEqual(CURSOR);
  });

  it.each([
    ['characters outside base64url', 'abc$'],
    ['text that is not JSON', Buffer.from('not json').toString('base64url')],
    ['a tuple of the wrong shape', encodeJson([CURSOR.createdAt])],
    ['a date that is not an instant', encodeJson(['yesterday', CURSOR.id])],
    ['an id that is not a UUID', encodeJson([CURSOR.createdAt, 'x'])],
  ])('should return null when the cursor holds %s', (_case, raw) => {
    expect(decodeNotificationCursor(raw)).toBeNull();
  });
});
