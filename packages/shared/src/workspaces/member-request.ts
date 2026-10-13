import { z } from 'zod';

import { memberRoleSchema } from '../auth/member-role.js';
import { idSchema } from '../common/id.js';

export const memberIdParamsSchema = z.object({ id: idSchema() });

export type MemberIdParams = z.infer<typeof memberIdParamsSchema>;

export const updateMemberRequestSchema = z
  .object({ role: memberRoleSchema })
  .meta({ id: 'UpdateMemberRequest' });

export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const TRANSFER_TO_MESSAGE = 'Choose another member';

// No .meta({ id }) on query schemas: with an id Swagger stops listing the query parameters.
export const removeMemberQuerySchema = z.object({
  transferTo: idSchema(TRANSFER_TO_MESSAGE),
});

export type RemoveMemberQuery = z.infer<typeof removeMemberQuerySchema>;
