import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadRootEnv } from './load-root-env';

describe('loadRootEnv', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'clientry-env-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function writeEnv(content: string): string {
    const path = join(directory, '.env');
    writeFileSync(path, content);
    return path;
  }

  it('should take only the web variables when the file also holds API secrets', () => {
    const path = writeEnv(
      [
        'API_URL=http://127.0.0.1:4000',
        String.raw`JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----`,
        'JWT_PRIVATE_KEY=secret',
        'DATABASE_URL=postgresql://localhost/clientry',
        'PORT=4000',
        'NODE_ENV=development',
      ].join('\n'),
    );
    const target: Record<string, string | undefined> = {};

    loadRootEnv(path, target);

    expect(target).toEqual({
      API_URL: 'http://127.0.0.1:4000',
      JWT_PUBLIC_KEY: String.raw`-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----`,
    });
  });

  it('should keep a variable that is already set when the file has another value', () => {
    const path = writeEnv('API_URL=http://127.0.0.1:4000\n');
    const target: Record<string, string | undefined> = { API_URL: 'https://api.example' };

    loadRootEnv(path, target);

    expect(target.API_URL).toBe('https://api.example');
  });

  it('should leave the environment unchanged when the file does not exist', () => {
    const target: Record<string, string | undefined> = {};

    loadRootEnv(join(directory, 'missing.env'), target);

    expect(target).toEqual({});
  });
});
