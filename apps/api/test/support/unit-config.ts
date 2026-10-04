import { generateSigningKeyPem, TRUSTED_ORIGIN } from './test-env.js';
import { loadConfig } from '../../src/infra/config/app-config.js';
import type { AppConfig } from '../../src/infra/config/app-config.js';

// For unit tests: no containers, a fresh signing key per call.
export function createUnitConfig(env: Readonly<Record<string, string>> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://clientry:clientry@127.0.0.1:5432/clientry',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_PRIVATE_KEY: generateSigningKeyPem(),
    TRUSTED_ORIGINS: TRUSTED_ORIGIN,
    ...env,
  });
}
