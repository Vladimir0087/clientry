import type { KeyObject } from 'node:crypto';

import { envSchema } from './env.schema.js';
import type { Env } from './env.schema.js';
import { InvalidConfigError } from './invalid-config.error.js';

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
    Object.freeze(this);
  }
}

export function loadConfig(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return new AppConfig(result.data);
  }
  // Built from paths and zod messages only: an issue's input may be a secret.
  const issues = result.error.issues.map((issue) => ({
    variable: issue.path.map(String).join('.'),
    reason: issue.message,
  }));
  throw new InvalidConfigError(issues);
}
