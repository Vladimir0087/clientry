import type { QueryClient } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { sessionKeys } from '@/entities/session';
import { createQueryClient } from '@/shared/api/query-client';
import type { CookieReader } from '@/shared/api/server-client';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { prefetchSession } from './prefetch-session';
import { TEST_SESSION } from '../../../../test/fixtures';
import { problemResponse } from '../../../../test/msw/problem';
import { server } from '../../../../test/msw/server';
import { createAccessToken } from '../../../../test/tokens';

const TIME_LIMIT_MS = 1000;
const SLACK_MS = 300;

function ok(): Response {
  return HttpResponse.json(TEST_SESSION);
}

function cookiesWith(accessToken: string): CookieReader {
  return { get: (name) => (name === ACCESS_TOKEN_COOKIE ? { value: accessToken } : undefined) };
}

function countMeRequests(resolver: () => Promise<Response> | Response): { count: number } {
  const counter = { count: 0 };
  server.use(
    http.get('*/api/auth/me', () => {
      counter.count += 1;
      return resolver();
    }),
  );
  return counter;
}

async function prefetchWith(accessToken: string, queryClient: QueryClient): Promise<number> {
  const cookies = cookiesWith(accessToken);
  const session = await verifyAccessToken(accessToken);
  const startedAt = performance.now();
  await prefetchSession(queryClient, cookies, session);
  return performance.now() - startedAt;
}

describe('prefetchSession', () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>;

  function writtenLines(): string[] {
    return stdoutWrite.mock.calls.map(([chunk]) => String(chunk));
  }

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should put the session in the cache when the API answers 200', async () => {
    const queryClient = createQueryClient();

    await prefetchWith(await createAccessToken(), queryClient);

    expect(queryClient.getQueryData(sessionKeys.current)).toEqual(TEST_SESSION);
    expect(writtenLines()).toEqual([]);
  });

  it.each([
    ['answers slower than the limit', async () => delay(TIME_LIMIT_MS + 1000).then(() => ok())],
    ['answers 401', () => problemResponse(401, 'AUTHENTICATION_REQUIRED')],
    ['answers 503', () => problemResponse(503, 'SERVICE_UNAVAILABLE')],
  ])('should resolve without data after one request when the API %s', async (_case, resolver) => {
    const counter = countMeRequests(resolver);
    const queryClient = createQueryClient();

    const elapsedMs = await prefetchWith(await createAccessToken(), queryClient);

    expect(counter.count).toBe(1);
    expect(elapsedMs).toBeLessThan(TIME_LIMIT_MS + SLACK_MS);
    expect(queryClient.getQueryData(sessionKeys.current)).toBeUndefined();
  });

  it('should send no request and log nothing when the access token has expired', async () => {
    const counter = countMeRequests(() => ok());
    const queryClient = createQueryClient();

    await prefetchWith(await createAccessToken({ expiresInSeconds: -60 }), queryClient);

    expect(counter.count).toBe(0);
    expect(queryClient.getQueryData(sessionKeys.current)).toBeUndefined();
    expect(writtenLines()).toEqual([]);
  });

  it.each([
    [
      'answers 503',
      () => problemResponse(503, 'SERVICE_UNAVAILABLE', { requestId: 'req-503' }),
      { reason: 'http', status: 503, code: 'SERVICE_UNAVAILABLE', requestId: 'req-503' },
    ],
    [
      'answers 401',
      () => problemResponse(401, 'AUTHENTICATION_REQUIRED', { requestId: 'req-401' }),
      { reason: 'http', status: 401, code: 'AUTHENTICATION_REQUIRED', requestId: 'req-401' },
    ],
    [
      'answers slower than the limit',
      async () => delay(TIME_LIMIT_MS + 1000).then(() => ok()),
      { reason: 'timeout' },
    ],
    ['refuses the connection', () => HttpResponse.error(), { reason: 'network' }],
    [
      'answers with a body off the schema',
      () => HttpResponse.json({ user: null }),
      { reason: 'contract' },
    ],
  ])('should log one warning when the API %s', async (_case, resolver, fields) => {
    countMeRequests(resolver);
    const accessToken = await createAccessToken();

    await prefetchWith(accessToken, createQueryClient());

    const lines = writtenLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: 40,
      time: expect.any(Number) as unknown,
      msg: 'Session prefetch failed',
      ...fields,
    });
    expect(lines.join('')).not.toContain(accessToken);
  });
});
