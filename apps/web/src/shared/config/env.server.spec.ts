import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InvalidConfigError } from '@clientry/shared/common';

import { parseWebEnv } from './env';

type KeyOptions = { type: 'ec'; namedCurve: string } | { type: 'rsa'; modulusLength: number };

function keyPair(options: KeyOptions): { readonly publicPem: string; readonly privatePem: string } {
  const { publicKey, privateKey } =
    options.type === 'ec'
      ? generateKeyPairSync('ec', { namedCurve: options.namedCurve })
      : generateKeyPairSync('rsa', { modulusLength: options.modulusLength });
  return {
    publicPem: publicKey.export({ format: 'pem', type: 'spki' }),
    privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  };
}

const P256 = keyPair({ type: 'ec', namedCurve: 'P-256' });
const API_URL = 'http://127.0.0.1:4000';
const VALID_ENV = { API_URL, JWT_PUBLIC_KEY: P256.publicPem };

function captureConfigError(source: Record<string, string | undefined>): InvalidConfigError {
  try {
    parseWebEnv(source);
  } catch (error) {
    if (error instanceof InvalidConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected parseWebEnv to throw');
}

function invalidVariables(source: Record<string, string | undefined>): string[] {
  return captureConfigError(source).issues.map(({ variable }) => variable);
}

describe('parseWebEnv', () => {
  it('should return a frozen config with the origin and an EC public key when both are valid', () => {
    const env = parseWebEnv(VALID_ENV);

    expect(env.apiUrl).toBe(API_URL);
    expect(env.jwtPublicKey.type).toBe('public');
    expect(env.jwtPublicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('should name both variables in one error when both are missing', () => {
    const error = captureConfigError({});

    expect(error.issues.map(({ variable }) => variable)).toEqual(['API_URL', 'JWT_PUBLIC_KEY']);
    expect(error.message).toContain('API_URL');
    expect(error.message).toContain('JWT_PUBLIC_KEY');
  });

  it('should keep values out of the message when variables are invalid', () => {
    const error = captureConfigError({
      API_URL: 'ftp://s3cret-host.example',
      JWT_PUBLIC_KEY: P256.privatePem,
    });

    expect(error.message).not.toMatch(/s3cret/);
    expect(error.message).not.toContain('PRIVATE KEY');
  });

  it('should normalize API_URL to its origin when it has a trailing slash', () => {
    const env = parseWebEnv({ ...VALID_ENV, API_URL: 'https://api.example:8443/' });

    expect(env.apiUrl).toBe('https://api.example:8443');
  });

  it.each(['http://127.0.0.1:4000/api', 'http://127.0.0.1:4000?x=1', 'ftp://127.0.0.1'])(
    'should reject API_URL when it is %s',
    (apiUrl) => {
      expect(invalidVariables({ ...VALID_ENV, API_URL: apiUrl })).toEqual(['API_URL']);
    },
  );

  it('should accept JWT_PUBLIC_KEY when its newlines are literal \n sequences', () => {
    const oneLine = P256.publicPem.trim().replaceAll('\n', String.raw`\n`);

    const env = parseWebEnv({ ...VALID_ENV, JWT_PUBLIC_KEY: oneLine });

    expect(env.jwtPublicKey.asymmetricKeyType).toBe('ec');
  });

  it.each([
    ['not a PEM', 'not a key'],
    ['an RSA key', keyPair({ type: 'rsa', modulusLength: 2048 }).publicPem],
    ['a P-384 key', keyPair({ type: 'ec', namedCurve: 'P-384' }).publicPem],
    ['a private key', P256.privatePem],
  ])('should reject JWT_PUBLIC_KEY when it is %s', (_label, value) => {
    expect(invalidVariables({ ...VALID_ENV, JWT_PUBLIC_KEY: value })).toEqual(['JWT_PUBLIC_KEY']);
  });
});
