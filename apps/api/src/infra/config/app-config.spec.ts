import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadConfig } from './app-config.js';
import { InvalidConfigError } from './invalid-config.error.js';
import { generateSigningKeyPem } from '../../../test/support/test-env.js';

const DATABASE_URL = 'postgresql://clientry:s3cret-db@127.0.0.1:5432/clientry';
const REDIS_URL = 'redis://:s3cret-redis@127.0.0.1:6379';

function privateKeyPem(
  options: { type: 'ec'; namedCurve: string } | { type: 'rsa'; modulusLength: number },
): string {
  const { privateKey } =
    options.type === 'ec'
      ? generateKeyPairSync('ec', { namedCurve: options.namedCurve })
      : generateKeyPairSync('rsa', { modulusLength: options.modulusLength });
  return privateKey.export({ format: 'pem', type: 'pkcs8' });
}

const JWT_PRIVATE_KEY = generateSigningKeyPem();
const TRUSTED_ORIGINS = 'http://localhost:3000';
const VALID_ENV = { DATABASE_URL, REDIS_URL, JWT_PRIVATE_KEY, TRUSTED_ORIGINS };

function captureConfigError(env: Record<string, string | undefined>): InvalidConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof InvalidConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('should apply defaults when only required variables are set', () => {
    const config = loadConfig(VALID_ENV);

    expect(config).toMatchObject({
      nodeEnv: 'production',
      port: 4000,
      logLevel: 'info',
      trustProxyHops: 0,
    });
  });

  it('should parse every variable when all are set', () => {
    const config = loadConfig({
      ...VALID_ENV,
      NODE_ENV: 'development',
      PORT: '8080',
      LOG_LEVEL: 'silent',
      TRUST_PROXY_HOPS: '2',
    });

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 8080,
      logLevel: 'silent',
      databaseUrl: DATABASE_URL,
      redisUrl: REDIS_URL,
      trustedOrigins: ['http://localhost:3000'],
      trustProxyHops: 2,
    });
  });

  it('should return a frozen config when parsing succeeds', () => {
    const config = loadConfig(VALID_ENV);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.trustedOrigins)).toBe(true);
  });

  it('should accept the URL when REDIS_URL uses rediss://', () => {
    const redisUrl = 'rediss://default:token@cache.example:6379';

    const config = loadConfig({ ...VALID_ENV, REDIS_URL: redisUrl });

    expect(config.redisUrl).toBe(redisUrl);
  });

  it('should reject the URL when REDIS_URL uses http://', () => {
    const error = captureConfigError({ ...VALID_ENV, REDIS_URL: 'http://127.0.0.1:6379' });

    expect(error.issues.map(({ variable }) => variable)).toEqual(['REDIS_URL']);
  });

  it.each([
    ['REDIS_URL', 'redis:'],
    ['REDIS_URL', 'redis://'],
    ['DATABASE_URL', 'postgresql:x'],
    ['DATABASE_URL', 'postgresql://'],
  ])('should reject %s when the URL %s has no host', (variable, url) => {
    const error = captureConfigError({ ...VALID_ENV, [variable]: url });

    expect(error.issues.map((issue) => issue.variable)).toEqual([variable]);
  });

  it('should name every invalid variable in one error when several are wrong', () => {
    const error = captureConfigError({ NODE_ENV: 'staging', PORT: 'eighty', LOG_LEVEL: 'loud' });

    expect(error.issues.map(({ variable }) => variable)).toEqual([
      'NODE_ENV',
      'PORT',
      'LOG_LEVEL',
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_PRIVATE_KEY',
      'TRUSTED_ORIGINS',
    ]);
  });

  it('should keep values out of the message when variables are invalid', () => {
    const error = captureConfigError({
      DATABASE_URL: 'mysql://root:s3cret-db@127.0.0.1/clientry',
      REDIS_URL: 'http://:s3cret-redis@127.0.0.1',
      PORT: 's3cret-port',
    });

    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).not.toMatch(/s3cret/);
  });

  describe('JWT_PRIVATE_KEY', () => {
    it('should derive the public key when the private key is on P-256', () => {
      const config = loadConfig(VALID_ENV);

      expect(config.jwtPrivateKey.type).toBe('private');
      expect(config.jwtPublicKey.type).toBe('public');
      expect(config.jwtPublicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
    });

    it('should accept the key when newlines are written as literal \n', () => {
      const oneLine = JWT_PRIVATE_KEY.trim().replaceAll('\n', String.raw`\n`);

      const config = loadConfig({ ...VALID_ENV, JWT_PRIVATE_KEY: oneLine });

      expect(config.jwtPrivateKey.asymmetricKeyType).toBe('ec');
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['not a PEM', 's3cret-not-a-key'],
      ['an RSA key', privateKeyPem({ type: 'rsa', modulusLength: 2048 })],
      ['a P-384 key', privateKeyPem({ type: 'ec', namedCurve: 'P-384' })],
    ])('should reject the key without quoting it when it is %s', (_case, value) => {
      const error = captureConfigError({ ...VALID_ENV, JWT_PRIVATE_KEY: value });

      expect(error.issues.map(({ variable }) => variable)).toEqual(['JWT_PRIVATE_KEY']);
      expect(error.message).not.toMatch(/s3cret|PRIVATE KEY|MI[GIE]/);
    });
  });

  describe('TRUSTED_ORIGINS', () => {
    it('should normalize every origin when the list has spaces and trailing slashes', () => {
      const config = loadConfig({
        ...VALID_ENV,
        TRUSTED_ORIGINS: 'http://localhost:3000/, HTTPS://Clientry.Example:443',
      });

      expect(config.trustedOrigins).toEqual(['http://localhost:3000', 'https://clientry.example']);
    });

    it.each([
      ['empty', ''],
      ['a path', 'http://localhost:3000/app'],
      ['a query', 'http://localhost:3000?x=1'],
      ['null', 'null'],
      ['an ftp scheme', 'ftp://files.example'],
      ['an empty entry', 'http://localhost:3000,'],
    ])('should reject the list when an entry is %s', (_case, value) => {
      const error = captureConfigError({ ...VALID_ENV, TRUSTED_ORIGINS: value });

      expect(error.issues.map(({ variable }) => variable)).toEqual(['TRUSTED_ORIGINS']);
    });
  });

  describe('TRUST_PROXY_HOPS', () => {
    it('should reject the count when it is negative', () => {
      const error = captureConfigError({ ...VALID_ENV, TRUST_PROXY_HOPS: '-1' });

      expect(error.issues.map(({ variable }) => variable)).toEqual(['TRUST_PROXY_HOPS']);
    });
  });
});
