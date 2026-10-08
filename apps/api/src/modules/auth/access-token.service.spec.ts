import { generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { SignJWT } from 'jose';
import type { JWTPayload } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '@clientry/shared/auth';

import { ACCESS_TOKEN_TTL_SECONDS, AccessTokenService } from './access-token.service.js';
import { AuthenticationRequiredError } from './errors.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';
import type { AuthUser } from '../../common/auth/auth-user.js';

const USER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'owner',
};

const SESSION_ID = '0199a3c4-5e71-7c2d-9e3f-4a5b6c7d8e9f';

const VALID_CLAIMS: JWTPayload = {
  sub: USER.id,
  sid: SESSION_ID,
  wid: USER.workspaceId,
  role: USER.role,
};

interface SignOptions {
  readonly claims?: JWTPayload;
  readonly key?: KeyObject | Uint8Array;
  readonly alg?: string;
  readonly issuer?: string;
  readonly audience?: string;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('AccessTokenService', () => {
  const config = createUnitConfig();
  const service = new AccessTokenService(config);

  function signRaw(options: SignOptions = {}): Promise<string> {
    return new SignJWT(options.claims ?? VALID_CLAIMS)
      .setProtectedHeader({ alg: options.alg ?? 'ES256' })
      .setIssuer(options.issuer ?? ACCESS_TOKEN_ISSUER)
      .setAudience(options.audience ?? ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(options.key ?? config.jwtPrivateKey);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the signed claims when a signed token is verified', async () => {
    const token = await service.sign(USER, SESSION_ID);

    await expect(service.verify(token)).resolves.toMatchObject(VALID_CLAIMS);
  });

  it('should reject the token when its lifetime has passed', async () => {
    vi.useFakeTimers();
    const token = await service.sign(USER, SESSION_ID);
    vi.advanceTimersByTime(ACCESS_TOKEN_TTL_SECONDS * 1000);

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should accept the token when its lifetime has not passed yet', async () => {
    vi.useFakeTimers();
    const token = await service.sign(USER, SESSION_ID);
    vi.advanceTimersByTime(ACCESS_TOKEN_TTL_SECONDS * 1000 - 1000);

    await expect(service.verify(token)).resolves.toMatchObject(VALID_CLAIMS);
  });

  it('should reject the token when another key signed it', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const token = await signRaw({ key: privateKey });

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should reject the token when it is unsigned with alg none', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...VALID_CLAIMS,
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
      iat: now,
      exp: now + 300,
    };
    const token = `${encodeSegment({ alg: 'none' })}.${encodeSegment(payload)}.`;

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should reject the token when HS256 uses the public key as the secret', async () => {
    const publicPem = config.jwtPublicKey.export({ format: 'pem', type: 'spki' }).toString();

    const token = await signRaw({ alg: 'HS256', key: new TextEncoder().encode(publicPem) });

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });

  it.each([
    ['issuer', { issuer: 'someone-else' }],
    ['audience', { audience: 'another-app' }],
  ])('should reject the token when the %s is wrong', async (_claim, options) => {
    const token = await signRaw(options);

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });

  it.each([
    ['has no workspace id', { sub: USER.id, sid: SESSION_ID, role: 'owner' }],
    ['has no session id', { sub: USER.id, wid: USER.workspaceId, role: 'owner' }],
    ['has an unknown role', { ...VALID_CLAIMS, role: 'admin' }],
  ])('should reject the token when it %s', async (_case, claims) => {
    const token = await signRaw({ claims });

    await expect(service.verify(token)).rejects.toThrow(AuthenticationRequiredError);
  });
});
