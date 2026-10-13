import { createParser } from 'nuqs/server';

import { memberFilterSchema } from '@clientry/shared/workspaces';
import type { MemberFilter } from '@clientry/shared/workspaces';

export const ANYONE = 'anyone';

function parseMemberFilter(query: string): MemberFilter | null {
  const result = memberFilterSchema.safeParse(query);
  return result.success ? result.data : null;
}

// From nuqs/server, so the server pages parse the same way. Any other value reads as no filter,
// so a hand-edited URL filters less instead of failing.
export const memberFilterParser = createParser<MemberFilter>({
  parse: parseMemberFilter,
  serialize: (value) => value,
});

// Tasks default to me, so anyone has a value of its own: "anyone", "me" or a member id.
export const taskMemberFilterParser = createParser<string>({
  parse: (query) => (query === ANYONE ? ANYONE : parseMemberFilter(query)),
  serialize: (value) => value,
});
