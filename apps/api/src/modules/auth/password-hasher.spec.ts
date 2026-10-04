import { describe, expect, it } from 'vitest';

import { PasswordHasher } from './password-hasher.js';

const PRECOMPOSED = 'caf\u00E9 au lait 2026';
const DECOMPOSED = 'cafe\u0301 au lait 2026';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('should produce an argon2id hash when a password is hashed', async () => {
    const passwordHash = await hasher.hash(PRECOMPOSED);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('should verify when the same password arrives with a combining accent', async () => {
    const passwordHash = await hasher.hash(PRECOMPOSED);

    const isValid = await hasher.verify(passwordHash, DECOMPOSED);

    expect(isValid).toBe(true);
  });

  it('should not verify when the password is wrong', async () => {
    const passwordHash = await hasher.hash(PRECOMPOSED);

    const isValid = await hasher.verify(passwordHash, 'cafe au lait 2026');

    expect(isValid).toBe(false);
  });

  it('should resolve without a result when the dummy hash is checked', async () => {
    await expect(hasher.verifyDummy(PRECOMPOSED)).resolves.toBeUndefined();
  });
});
