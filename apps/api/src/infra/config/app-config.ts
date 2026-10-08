import type { KeyObject } from 'node:crypto';

import { InvalidConfigError } from '@clientry/shared/common';

import { envSchema } from './env.schema.js';
import type { Env } from './env.schema.js';

type NodeEnv = Env['NODE_ENV'];
type LogLevel = Env['LOG_LEVEL'];

export class AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtPrivateKey: KeyObject;
  readonly jwtPublicKey: KeyObject;
  readonly trustedOrigins: readonly string[];
  readonly trustProxyHops: number;
  readonly appVersion: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.logLevel = env.LOG_LEVEL;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.jwtPrivateKey = env.JWT_PRIVATE_KEY.privateKey;
    this.jwtPublicKey = env.JWT_PRIVATE_KEY.publicKey;
    this.trustedOrigins = env.TRUSTED_ORIGINS;
    this.trustProxyHops = env.TRUST_PROXY_HOPS;
    this.appVersion = env.APP_VERSION;
    Object.freeze(this);
  }
}

export function loadConfig(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return new AppConfig(result.data);
  }
  throw InvalidConfigError.fromZodError(result.error);
}
