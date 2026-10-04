import { z } from 'zod';

import { memberRoleSchema } from './member-role.js';

export const sessionResponseSchema = z
  .object({
    user: z.object({ id: z.uuid(), email: z.email(), name: z.string() }),
    workspace: z.object({ id: z.uuid(), name: z.string() }),
    role: memberRoleSchema,
  })
  .meta({ id: 'SessionResponse' });

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
