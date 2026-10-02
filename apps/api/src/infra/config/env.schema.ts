import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const NON_EMPTY = /^.+$/;

function urlError(expected: string): (issue: { readonly input: unknown }) => string {
  return (issue) => (issue.input === undefined ? 'is required' : `must be a ${expected} URL`);
}

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
});

export type Env = z.infer<typeof envSchema>;
