import { z } from 'zod';

import { memberRoleSchema } from './member-role.js';

export const ACCESS_TOKEN_ISSUER = 'clientry-api';
export const ACCESS_TOKEN_AUDIENCE = 'clientry';
export const ACCESS_TOKEN_COOKIE = 'clientry_access';
export const REFRESH_TOKEN_COOKIE = 'clientry_refresh';

export const accessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  wid: z.uuid(),
  role: memberRoleSchema,
  iat: z.int(),
  exp: z.int(),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
