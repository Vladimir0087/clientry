import { createPrivateKey, sign } from 'node:crypto';

import type { BrowserContext } from '@playwright/test';

import { ACCESS_TOKEN_COOKIE, accessTokenClaimsSchema } from '@clientry/shared/auth';

export const SIGNING_KEY_VARIABLE = 'E2E_SIGNING_KEY';

const HOUR_S = 3600;

class AccessTokenError extends Error {
  override readonly name = 'AccessTokenError';
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signingKey(): string {
  const pem = process.env[SIGNING_KEY_VARIABLE];
  if (pem === undefined || pem === '') {
    throw new AccessTokenError(`${SIGNING_KEY_VARIABLE} is not set: run through global setup`);
  }
  return pem;
}

function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (payload === undefined) {
    throw new AccessTokenError('The access cookie holds no JWT');
  }
  const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
  // Loose, so iss and aud stay: the copy must keep every claim.
  return accessTokenClaimsSchema.loose().parse(claims);
}

// The same claims and signature the API would issue, but with a lifetime that ended an hour ago.
function expiredCopy(token: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...decodeClaims(token), iat: now - 2 * HOUR_S, exp: now - HOUR_S };
  const signingInput = `${base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(signingKey()),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

export async function expireAccessToken(context: BrowserContext): Promise<void> {
  const cookie = (await context.cookies()).find(({ name }) => name === ACCESS_TOKEN_COOKIE);
  if (cookie === undefined) {
    throw new AccessTokenError('The context has no access cookie');
  }
  await context.addCookies([{ ...cookie, value: expiredCopy(cookie.value) }]);
}
