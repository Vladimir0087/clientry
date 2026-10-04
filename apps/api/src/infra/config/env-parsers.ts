import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface SigningKeys {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

const P256_CURVE = 'prime256v1';
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

// Hosting panels that take one line get the PEM with literal \n sequences.
export function parseSigningKey(value: string): SigningKeys | undefined {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: value.replaceAll(String.raw`\n`, '\n'), format: 'pem' });
  } catch {
    return undefined;
  }
  const isP256 =
    privateKey.asymmetricKeyType === 'ec' &&
    privateKey.asymmetricKeyDetails?.namedCurve === P256_CURVE;
  return isP256 ? { privateKey, publicKey: createPublicKey(privateKey) } : undefined;
}

export function parseOrigin(entry: string): string | undefined {
  if (!URL.canParse(entry)) {
    return undefined;
  }
  const url = new URL(entry);
  const isBareOrigin =
    HTTP_PROTOCOLS.has(url.protocol) &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '' &&
    !entry.endsWith('?') &&
    !entry.endsWith('#');
  return isBareOrigin ? url.origin : undefined;
}
