import { generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicPem: string;
}

function createKeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicPem: publicKey.export({ format: 'pem', type: 'spki' }) };
}

// The web trusts SIGNING_KEYS through JWT_PUBLIC_KEY; FOREIGN_KEYS stand for anyone else.
export const SIGNING_KEYS = createKeyPair();
export const FOREIGN_KEYS = createKeyPair();
