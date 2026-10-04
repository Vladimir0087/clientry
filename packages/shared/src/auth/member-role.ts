import { z } from 'zod';

export const memberRoleSchema = z.enum(['owner', 'manager']);

export type MemberRole = z.infer<typeof memberRoleSchema>;
