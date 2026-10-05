import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface SigningKeys {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

const P256_CURVE = 'prime256v1';

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
