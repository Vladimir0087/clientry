import { describe, expect, it } from 'vitest';

import { verifyAccessToken } from './verify-access-token';
import { TEST_SESSION } from '../../../test/fixtures';
import { FOREIGN_KEYS } from '../../../test/keys';
import { createAccessToken } from '../../../test/tokens';
import type { AccessTokenOverrides } from '../../../test/tokens';

const EXPIRED = { expiresInSeconds: -60 } as const;

describe('verifyAccessToken', () => {
  it('should return authenticated with the claims when the token is valid', async () => {
    const session = await verifyAccessToken(await createAccessToken());

    expect(session).toMatchObject({
      status: 'authenticated',
      claims: {
        sub: TEST_SESSION.user.id,
        wid: TEST_SESSION.workspace.id,
        role: TEST_SESSION.role,
      },
    });
  });

  it('should return expired when only exp has passed', async () => {
    const session = await verifyAccessToken(await createAccessToken(EXPIRED));

    expect(session).toEqual({ status: 'expired' });
  });

  it.each<[string, AccessTokenOverrides]>([
    ['signed by another key', { ...EXPIRED, privateKey: FOREIGN_KEYS.privateKey }],
    ['issued by someone else', { ...EXPIRED, issuer: 'evil' }],
    ['carrying claims off the schema', { ...EXPIRED, claims: { role: 'admin' } }],
  ])('should return anonymous when an expired token is %s', async (_case, overrides) => {
    const session = await verifyAccessToken(await createAccessToken(overrides));

    expect(session).toEqual({ status: 'anonymous' });
  });

  it.each<[string, AccessTokenOverrides]>([
    ['signed by another key', { privateKey: FOREIGN_KEYS.privateKey }],
    ['unsigned with alg none', { algorithm: 'none' }],
    ['HS256 signed with the public key as the secret', { algorithm: 'HS256' }],
    ['issued by someone else', { issuer: 'evil' }],
    ['meant for another audience', { audience: 'evil' }],
    ['missing wid', { claims: { wid: undefined } }],
  ])('should return anonymous when the token is %s', async (_case, overrides) => {
    const session = await verifyAccessToken(await createAccessToken(overrides));

    expect(session).toEqual({ status: 'anonymous' });
  });

  it.each([
    ['garbage', 'not-a-jwt'],
    ['empty', ''],
    ['missing', undefined],
  ])('should return anonymous when the cookie is %s', async (_case, token) => {
    const session = await verifyAccessToken(token);

    expect(session).toEqual({ status: 'anonymous' });
  });
});
