import { createHash } from 'node:crypto';

import { SignJWT } from 'jose';

import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';

import { AppConfig } from '../../src/infra/config/app-config.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../src/modules/auth/access-token.service.js';
import type { TestApp } from '../create-test-app.js';

export interface AccessTokenInput {
  readonly session: SessionResponse;
  readonly sid: string;
  // Seconds since the epoch; five minutes from now by default.
  readonly expiresAt?: number;
}

// Computed here rather than with the API's helper, so tests check the stored hash independently.
export function refreshTokenHash(token: string): Uint8Array<ArrayBuffer> {
  return createHash('sha256').update(token).digest();
}

// Signed with the app's own key, for claims the API would never issue itself.
export function signAccessToken(
  { app }: TestApp,
  { session, sid, expiresAt }: AccessTokenInput,
): Promise<string> {
  const expiry = expiresAt ?? Math.floor(Date.now() / 1000) + 300;
  return new SignJWT({ sid, wid: session.workspace.id, role: session.role })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(session.user.id)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(expiry - ACCESS_TOKEN_TTL_SECONDS)
    .setExpirationTime(expiry)
    .sign(app.get(AppConfig).jwtPrivateKey);
}
