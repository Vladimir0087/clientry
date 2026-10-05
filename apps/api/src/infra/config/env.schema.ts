import { z } from 'zod';

import { parseOrigin } from '@clientry/shared/common';

import { parseSigningKey } from './env-parsers.js';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const NON_EMPTY = /^.+$/;

function urlError(expected: string): (issue: { readonly input: unknown }) => string {
  return (issue) => (issue.input === undefined ? 'is required' : `must be a ${expected} URL`);
}

// Issues never quote the input: these values are secrets or hold them.
const requiredString = z.string({ error: 'is required' }).min(1, 'is required');

const signingKeySchema = requiredString.transform((value, context) => {
  const keys = parseSigningKey(value);
  if (!keys) {
    context.addIssue({ code: 'custom', message: 'must be a PEM private key on the P-256 curve' });
    return z.NEVER;
  }
  return keys;
});

const trustedOriginsSchema = requiredString.transform((value, context) => {
  const origins = value.split(',').map((entry) => parseOrigin(entry.trim()));
  const valid = origins.filter((origin) => origin !== undefined);
  if (valid.length !== origins.length) {
    context.addIssue({
      code: 'custom',
      message: 'must be comma-separated http(s) origins without a path, query or fragment',
    });
    return z.NEVER;
  }
  return Object.freeze([...new Set(valid)]);
});

export const envSchema = z.object({
  // A host that forgets NODE_ENV must never try to load the dev-only pino-pretty.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  // A URL without a host (a typo such as "redis:") would boot and stay not ready forever.
  DATABASE_URL: z.url({
    protocol: /^postgresql$/,
    hostname: NON_EMPTY,
    error: urlError('postgresql://'),
  }),
  REDIS_URL: z.url({
    protocol: /^rediss?$/,
    hostname: NON_EMPTY,
    error: urlError('redis:// or rediss://'),
  }),
  JWT_PRIVATE_KEY: signingKeySchema,
  TRUSTED_ORIGINS: trustedOriginsSchema,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;
