import { describe, expect, it } from 'vitest';

import { resolveRequestId } from './request-id.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it.each(['abc-123', 'trace_id.42:x', 'a'.repeat(128)])(
    'should reuse the header when it is %s',
    (header) => {
      expect(resolveRequestId(header)).toBe(header);
    },
  );

  it.each([
    ['too long', 'a'.repeat(129)],
    ['empty', ''],
    ['with spaces', 'id with spaces'],
    ['repeated', ['a', 'b']],
  ])('should generate a UUID when the header is %s', (_case, header) => {
    expect(resolveRequestId(header)).toMatch(UUID_PATTERN);
  });

  it('should generate a UUID when the header is missing', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
  });
});
