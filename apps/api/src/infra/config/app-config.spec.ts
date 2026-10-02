import { describe, expect, it } from 'vitest';

import { loadConfig } from './app-config.js';
import { InvalidConfigError } from './invalid-config.error.js';

const DATABASE_URL = 'postgresql://clientry:s3cret-db@127.0.0.1:5432/clientry';
const REDIS_URL = 'redis://:s3cret-redis@127.0.0.1:6379';
const VALID_ENV = { DATABASE_URL, REDIS_URL };

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

    expect(config).toMatchObject({ nodeEnv: 'production', port: 4000, logLevel: 'info' });
  });

  it('should parse every variable when all are set', () => {
    const config = loadConfig({
      ...VALID_ENV,
      NODE_ENV: 'development',
      PORT: '8080',
      LOG_LEVEL: 'silent',
    });

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 8080,
      logLevel: 'silent',
      databaseUrl: DATABASE_URL,
      redisUrl: REDIS_URL,
    });
  });

  it('should return a frozen config when parsing succeeds', () => {
    const config = loadConfig(VALID_ENV);

    expect(Object.isFrozen(config)).toBe(true);
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
});
