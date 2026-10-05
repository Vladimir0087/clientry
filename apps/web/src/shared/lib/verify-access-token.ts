import 'server-only';

import { errors, jwtVerify } from 'jose';

import { getWebEnv } from '@/shared/config/env';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  accessTokenClaimsSchema,
} from '@clientry/shared/auth';
import type { AccessTokenClaims } from '@clientry/shared/auth';

const ALGORITHM = 'ES256';

export type AccessSession =
  | { readonly status: 'authenticated'; readonly claims: AccessTokenClaims }
  | { readonly status: 'expired' }
  | { readonly status: 'anonymous' };

const ANONYMOUS: AccessSession = { status: 'anonymous' };
const EXPIRED: AccessSession = { status: 'expired' };

// jose throws JWTExpired only after the signature, algorithm, issuer and audience have passed.
export async function verifyAccessToken(token: string | undefined): Promise<AccessSession> {
  if (token === undefined || token === '') {
    return ANONYMOUS;
  }
  try {
    const { payload } = await jwtVerify(token, getWebEnv().jwtPublicKey, {
      algorithms: [ALGORITHM],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
    const claims = accessTokenClaimsSchema.safeParse(payload);
    return claims.success ? { status: 'authenticated', claims: claims.data } : ANONYMOUS;
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return accessTokenClaimsSchema.safeParse(error.payload).success ? EXPIRED : ANONYMOUS;
    }
    if (error instanceof errors.JOSEError) {
      return ANONYMOUS;
    }
    throw error;
  }
}
