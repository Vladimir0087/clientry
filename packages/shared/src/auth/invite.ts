import { z } from 'zod';

import { loginFields, newAccountFields } from './credentials.js';

const INVALID_INVITE_LINK = 'Invalid invite link';

// 32 random bytes in base64url without padding.
export const inviteTokenSchema = z
  .string({ error: INVALID_INVITE_LINK })
  .regex(/^[\w-]{43}$/, INVALID_INVITE_LINK);

export const invitePreviewRequestSchema = z
  .object({ token: inviteTokenSchema })
  .meta({ id: 'InvitePreviewRequest' });

export type InvitePreviewRequest = z.infer<typeof invitePreviewRequestSchema>;

export const invitePreviewResponseSchema = z
  .object({
    workspace: z.object({ name: z.string() }),
    invitedBy: z.object({ name: z.string() }),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'InvitePreview' });

export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

export const inviteRegisterRequestSchema = z
  .object({ token: inviteTokenSchema, ...newAccountFields })
  .meta({ id: 'InviteRegisterRequest' });

export type InviteRegisterRequest = z.infer<typeof inviteRegisterRequestSchema>;

export const inviteLoginRequestSchema = z
  .object({ token: inviteTokenSchema, ...loginFields })
  .meta({ id: 'InviteLoginRequest' });

export type InviteLoginRequest = z.infer<typeof inviteLoginRequestSchema>;
