import { describe, expect, it } from 'vitest';

import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

describe('opaque token helpers', () => {
  it('should generate a 43-character base64url value when a token is created', () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('should generate a different value when called twice', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  it('should give the same 32-byte hash when the same token is hashed twice', () => {
    const token = generateOpaqueToken();

    const first = hashOpaqueToken(token);
    const second = hashOpaqueToken(token);

    expect(first).toHaveLength(32);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('should differ from the token when the hash is encoded the same way', () => {
    const token = generateOpaqueToken();

    const hash = Buffer.from(hashOpaqueToken(token)).toString('base64url');

    expect(hash).not.toBe(token);
  });
});
