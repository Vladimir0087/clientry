import { generateKeyPairSync } from 'node:crypto';

export const TRUSTED_ORIGIN = 'http://localhost:3000';
// The same images as compose.yaml.
export const POSTGRES_IMAGE = 'postgres:18';
export const VALKEY_IMAGE = 'valkey/valkey:8.1';
export const TEST_APP_VERSION = 'integration-test';

// A fresh key per call, so no signing key is ever committed, not even a test one.
export function generateSigningKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}
