// next.config.ts loads this file under Node's type stripping: packages only, no relative or @/ imports.

import { createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { z } from 'zod';

import { InvalidConfigError, parseOrigin } from '@clientry/shared/common';

const P256_CURVE = 'prime256v1';
const SPKI_HEADER = '-----BEGIN PUBLIC KEY-----';

export interface WebEnv {
  readonly apiUrl: string;
  readonly jwtPublicKey: KeyObject;
}

// createPublicKey also accepts a private key and derives its public half, so the header is checked.
function parsePublicKey(value: string): KeyObject | undefined {
  const pem = value.replaceAll(String.raw`\n`, '\n').trim();
  if (!pem.startsWith(SPKI_HEADER)) {
    return undefined;
  }
  let key: KeyObject;
  try {
    key = createPublicKey({ key: pem, format: 'pem' });
  } catch {
    return undefined;
  }
  const isP256 =
    key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === P256_CURVE;
  return isP256 ? key : undefined;
}

// Issues never quote the input: the key and the address are deployment details.
const requiredString = z.string({ error: 'is required' }).min(1, 'is required');

const envSchema = z.object({
  API_URL: requiredString.transform((value, context) => {
    const origin = parseOrigin(value);
    if (origin === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'must be an http(s) origin without a path, query or fragment',
      });
      return z.NEVER;
    }
    return origin;
  }),
  JWT_PUBLIC_KEY: requiredString.transform((value, context) => {
    const key = parsePublicKey(value);
    if (key === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'must be a PEM public key (SPKI) on the P-256 curve',
      });
      return z.NEVER;
    }
    return key;
  }),
});

export function parseWebEnv(source: Readonly<Record<string, string | undefined>>): WebEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw InvalidConfigError.fromZodError(result.error);
  }
  return Object.freeze({
    apiUrl: result.data.API_URL,
    jwtPublicKey: result.data.JWT_PUBLIC_KEY,
  });
}

let cachedEnv: WebEnv | undefined;

export function getWebEnv(): WebEnv {
  cachedEnv ??= parseWebEnv(process.env);
  return cachedEnv;
}
