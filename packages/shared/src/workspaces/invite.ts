import { z } from 'zod';

import { inviteTokenSchema } from '../auth/invite.js';
import { idSchema } from '../common/id.js';

export const inviteIdParamsSchema = z.object({ id: idSchema() });

export type InviteIdParams = z.infer<typeof inviteIdParamsSchema>;

export const inviteSummarySchema = z
  .object({
    id: z.uuid(),
    createdBy: z.object({ id: z.uuid(), name: z.string() }),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'InviteSummary' });

export type InviteSummary = z.infer<typeof inviteSummarySchema>;

export const inviteListResponseSchema = z
  .object({ items: z.array(inviteSummarySchema) })
  .meta({ id: 'InviteList' });

export type InviteListResponse = z.infer<typeof inviteListResponseSchema>;

// The only response that carries the token: it cannot be shown again.
export const createdInviteResponseSchema = inviteSummarySchema
  .extend({ token: inviteTokenSchema })
  .meta({ id: 'CreatedInvite' });

export type CreatedInviteResponse = z.infer<typeof createdInviteResponseSchema>;
