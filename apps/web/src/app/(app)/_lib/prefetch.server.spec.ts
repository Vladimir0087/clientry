import type { QueryClient } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { clientKeys, normalizeClientFilters } from '@/entities/client';
import { sessionKeys } from '@/entities/session';
import { loadClientFilters } from '@/features/client-filters';
import { createQueryClient } from '@/shared/api/query-client';
import type { CookieReader } from '@/shared/api/server-client';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { prefetchClient, prefetchClientList, prefetchSession } from './prefetch';
import type { PrefetchRequest } from './prefetch';
import { TEST_CLIENT, TEST_CLIENT_LIST } from '../../../../test/clients';
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

async function requestWith(accessToken: string): Promise<PrefetchRequest> {
  return { cookies: cookiesWith(accessToken), session: await verifyAccessToken(accessToken) };
}

function countRequests(
  path: string,
  resolver: () => Promise<Response> | Response,
): { count: number; urls: string[] } {
  const counter = { count: 0, urls: [] as string[] };
  server.use(
    http.get(`*${path}`, ({ request }) => {
      counter.count += 1;
      counter.urls.push(request.url);
      return resolver();
    }),
  );
  return counter;
}

async function prefetchWith(accessToken: string, queryClient: QueryClient): Promise<number> {
  const request = await requestWith(accessToken);
  const startedAt = performance.now();
  await prefetchSession(queryClient, request);
  return performance.now() - startedAt;
}

describe('prefetch', () => {
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

  describe('prefetchSession', () => {
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
      const counter = countRequests('/api/auth/me', resolver);
      const queryClient = createQueryClient();

      const elapsedMs = await prefetchWith(await createAccessToken(), queryClient);

      expect(counter.count).toBe(1);
      expect(elapsedMs).toBeLessThan(TIME_LIMIT_MS + SLACK_MS);
      expect(queryClient.getQueryData(sessionKeys.current)).toBeUndefined();
    });

    it('should send no request and log nothing when the access token has expired', async () => {
      const counter = countRequests('/api/auth/me', () => ok());
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
      countRequests('/api/auth/me', resolver);
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

  describe('prefetchClientList', () => {
    it('should fill the cache under the key the client hook builds when the URL has filters', async () => {
      const counter = countRequests('/api/clients', () => HttpResponse.json(TEST_CLIENT_LIST));
      const queryClient = createQueryClient();
      const filters = await loadClientFilters(Promise.resolve({ source: 'website', tags: 'vip' }));

      await prefetchClientList(queryClient, await requestWith(await createAccessToken()), filters);

      const key = clientKeys.list(
        normalizeClientFilters({
          q: '',
          sources: ['website'],
          tags: ['vip'],
          isMine: false,
          sort: 'newest',
        }),
      );
      expect(queryClient.getQueryData(key)).toEqual({
        pages: [TEST_CLIENT_LIST],
        pageParams: [null],
      });
      expect(counter.urls.map((url) => new URL(url).search)).toEqual([
        '?source=website&tag=vip&limit=25',
      ]);
    });

    it('should log one warning with the query name when the API fails', async () => {
      countRequests('/api/clients', () => problemResponse(503, 'SERVICE_UNAVAILABLE'));
      const filters = await loadClientFilters({});

      await prefetchClientList(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        filters,
      );

      const lines = writtenLines();
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        msg: 'Client list prefetch failed',
        reason: 'http',
        status: 503,
      });
    });

    it('should send no request when the access token has expired', async () => {
      const counter = countRequests('/api/clients', () => HttpResponse.json(TEST_CLIENT_LIST));

      await prefetchClientList(
        createQueryClient(),
        await requestWith(await createAccessToken({ expiresInSeconds: -60 })),
        await loadClientFilters({}),
      );

      expect(counter.count).toBe(0);
    });
  });

  describe('prefetchClient', () => {
    it('should put the client in the cache when the API answers 200', async () => {
      countRequests(`/api/clients/${TEST_CLIENT.id}`, () => HttpResponse.json(TEST_CLIENT));
      const queryClient = createQueryClient();

      await prefetchClient(
        queryClient,
        await requestWith(await createAccessToken()),
        TEST_CLIENT.id,
      );

      expect(queryClient.getQueryData(clientKeys.detail(TEST_CLIENT.id))).toEqual(TEST_CLIENT);
    });

    it('should log nothing when the client is not found', async () => {
      countRequests(`/api/clients/${TEST_CLIENT.id}`, () =>
        problemResponse(404, 'CLIENT_NOT_FOUND'),
      );

      await prefetchClient(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        TEST_CLIENT.id,
      );

      expect(writtenLines()).toEqual([]);
    });
  });
});
