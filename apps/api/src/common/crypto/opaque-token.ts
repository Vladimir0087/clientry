import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

// SHA-256, not a slow hash: the token has 256 bits of entropy and is looked up by its hash.
export function hashOpaqueToken(token: string): Uint8Array<ArrayBuffer> {
  return createHash('sha256').update(token).digest();
}
