import { describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

describe('refresh token helpers', () => {
  it('should generate a 43-character base64url value when a token is created', () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('should generate a different value when called twice', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });

  it('should give the same 32-byte hash when the same token is hashed twice', () => {
    const token = generateRefreshToken();

    const first = hashRefreshToken(token);
    const second = hashRefreshToken(token);

    expect(first).toHaveLength(32);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('should differ from the token when the hash is encoded the same way', () => {
    const token = generateRefreshToken();

    const hash = Buffer.from(hashRefreshToken(token)).toString('base64url');

    expect(hash).not.toBe(token);
  });
});
