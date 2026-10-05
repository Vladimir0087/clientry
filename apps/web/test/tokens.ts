import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { SignJWT } from 'jose';

import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '@clientry/shared/auth';

import { TEST_SESSION } from './fixtures';
import { SIGNING_KEYS } from './keys';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenOverrides {
  // Negative for a token that has already expired.
  readonly expiresInSeconds?: number;
  readonly privateKey?: KeyObject;
  // HS256 is signed with the public key as the HMAC secret, the classic algorithm confusion.
  readonly algorithm?: 'ES256' | 'HS256' | 'none';
  readonly issuer?: string;
  readonly audience?: string;
  // An undefined value drops the claim.
  readonly claims?: Readonly<Record<string, unknown>>;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export async function createAccessToken(overrides: AccessTokenOverrides = {}): Promise<string> {
  const exp =
    Math.floor(Date.now() / 1000) + (overrides.expiresInSeconds ?? ACCESS_TOKEN_TTL_SECONDS);
  const payload = {
    sub: TEST_SESSION.user.id,
    sid: randomUUID(),
    wid: TEST_SESSION.workspace.id,
    role: TEST_SESSION.role,
    iss: overrides.issuer ?? ACCESS_TOKEN_ISSUER,
    aud: overrides.audience ?? ACCESS_TOKEN_AUDIENCE,
    iat: exp - ACCESS_TOKEN_TTL_SECONDS,
    exp,
    ...overrides.claims,
  };
  const algorithm = overrides.algorithm ?? 'ES256';
  if (algorithm === 'none') {
    return `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${encodeSegment(payload)}.`;
  }
  const key =
    algorithm === 'HS256'
      ? new TextEncoder().encode(SIGNING_KEYS.publicPem)
      : (overrides.privateKey ?? SIGNING_KEYS.privateKey);
  return new SignJWT(payload).setProtectedHeader({ alg: algorithm, typ: 'JWT' }).sign(key);
}
