import { z } from 'zod';

import { memberRoleSchema } from '../auth/member-role.js';

// id is the user id: deals and tasks reference members by it.
export const memberSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: memberRoleSchema,
    joinedAt: z.iso.datetime(),
  })
  .meta({ id: 'Member' });

export type Member = z.infer<typeof memberSchema>;

export const memberListResponseSchema = z
  .object({ items: z.array(memberSchema) })
  .meta({ id: 'MemberList' });

export type MemberListResponse = z.infer<typeof memberListResponseSchema>;
