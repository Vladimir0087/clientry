import { describe, expect, it } from 'vitest';

import { memberFilterSchema } from './member-filter.js';
import { removeMemberQuerySchema, updateMemberRequestSchema } from './member-request.js';
import { renameWorkspaceRequestSchema } from './workspace.js';
import { registerRequestSchema } from '../auth/credentials.js';

const MEMBER_ID = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

function messagesOf(result: {
  readonly error?: { readonly issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map(({ message }) => message);
}

describe('updateMemberRequestSchema', () => {
  it('should accept the request when the role is known', () => {
    expect(updateMemberRequestSchema.parse({ role: 'owner' })).toEqual({ role: 'owner' });
  });

  it.each([{}, { role: 'admin' }])('should reject the request when it is %j', (body) => {
    expect(updateMemberRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('renameWorkspaceRequestSchema', () => {
  it('should trim the name when it has surrounding spaces', () => {
    expect(renameWorkspaceRequestSchema.parse({ name: '  Pixel Studio ' }).name).toBe(
      'Pixel Studio',
    );
  });

  it.each([
    ['blank', '   ', 'Enter a workspace name'],
    ['101 characters long', 'n'.repeat(101), 'Use at most 100 characters'],
    ['holding NUL', 'Pixel\u0000', 'Must not contain NUL characters'],
  ])('should read the rule message when the name is %s', (_case, name, text) => {
    expect(messagesOf(renameWorkspaceRequestSchema.safeParse({ name }))).toEqual([text]);
  });

  it('should keep the same rule in registration when the workspace name is too long', () => {
    const result = registerRequestSchema.safeParse({
      email: 'ann@studio.dev',
      password: 'correct horse battery',
      name: 'Ann',
      workspaceName: 'n'.repeat(101),
    });

    expect(messagesOf(result)).toEqual(['Use at most 100 characters']);
  });
});

describe('memberFilterSchema', () => {
  it.each(['me', MEMBER_ID])('should accept the filter when it is %s', (filter) => {
    expect(memberFilterSchema.parse(filter)).toBe(filter);
  });

  it('should lowercase the id when it is an uppercase UUID', () => {
    expect(memberFilterSchema.parse(MEMBER_ID.toUpperCase())).toBe(MEMBER_ID);
  });

  it.each(['someone', 'anyone'])('should reject the filter when it is %s', (filter) => {
    expect(memberFilterSchema.safeParse(filter).success).toBe(false);
  });
});

describe('removeMemberQuerySchema', () => {
  it.each([{}, { transferTo: 'abc' }])(
    'should read "Choose another member" when the query is %j',
    (query) => {
      expect(messagesOf(removeMemberQuerySchema.safeParse(query))).toEqual([
        'Choose another member',
      ]);
    },
  );
});
