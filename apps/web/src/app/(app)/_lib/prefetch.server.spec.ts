import type { QueryClient } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { clientKeys, normalizeClientFilters } from '@/entities/client';
import { dealKeys, stageKeys } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { notificationKeys } from '@/entities/notification';
import { sessionKeys } from '@/entities/session';
import { taskKeys } from '@/entities/task';
import { loadClientFilters } from '@/features/client-filters';
import { loadBoardFilters } from '@/features/deal-filters';
import { loadTaskFilters } from '@/features/task-filters';
import { createQueryClient } from '@/shared/api/query-client';
import type { CookieReader } from '@/shared/api/server-client';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import {
  prefetchBoard,
  prefetchClient,
  prefetchClientDeals,
  prefetchClientList,
  prefetchDeal,
  prefetchDealHistory,
  prefetchFilterMembers,
  prefetchMembers,
  prefetchSession,
  prefetchStages,
  prefetchTask,
  prefetchTaskList,
  prefetchUnreadCount,
} from './prefetch';
import type { PrefetchRequest } from './prefetch';
import { taskSectionFilters } from './task-section-filters';
import { TEST_CLIENT, TEST_CLIENT_LIST } from '../../../../test/clients';
import { makeBoard, TEST_DEAL, TEST_MEMBERS, TEST_STAGES } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { problemResponse } from '../../../../test/msw/problem';
import { server } from '../../../../test/msw/server';
import { makeTaskPage, TEST_TASK } from '../../../../test/tasks';
import { createAccessToken } from '../../../../test/tokens';

const TIME_LIMIT_MS = 1000;
const SLACK_MS = 300;
const OTHER_MEMBER_ID = '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f';

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

  describe('prefetchMembers', () => {
    it('should fill the members key the client hook reads when the team page loads', async () => {
      countRequests('/api/members', () => HttpResponse.json(TEST_MEMBERS));
      const queryClient = createQueryClient();

      await prefetchMembers(queryClient, await requestWith(await createAccessToken()));

      expect(queryClient.getQueryData(memberKeys.list)).toEqual(TEST_MEMBERS);
    });

    it('should log one warning with the label when the members fail', async () => {
      countRequests('/api/members', () => problemResponse(503, 'SERVICE_UNAVAILABLE'));

      await prefetchMembers(createQueryClient(), await requestWith(await createAccessToken()));

      const lines = writtenLines();
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        level: 40,
        msg: 'Members prefetch failed',
      });
    });
  });

  describe('prefetchFilterMembers', () => {
    it('should ask for the members once when the board URL has another member id', async () => {
      const members = countRequests('/api/members', () => HttpResponse.json(TEST_MEMBERS));
      const filters = await loadBoardFilters(Promise.resolve({ assignee: OTHER_MEMBER_ID }));

      await prefetchFilterMembers(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        filters.assignee,
      );

      expect(members.count).toBe(1);
    });

    it.each([
      ['/deals', () => loadBoardFilters({})],
      ['/tasks', () => loadTaskFilters({})],
      ['/deals?assignee=<own id>', () => loadBoardFilters({ assignee: TEST_SESSION.user.id })],
    ])('should ask for no members when %s has no other member id', async (_page, load) => {
      const members = countRequests('/api/members', () => HttpResponse.json(TEST_MEMBERS));
      const { assignee } = await load();

      await prefetchFilterMembers(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        assignee,
      );

      expect(members.count).toBe(0);
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
          createdBy: null,
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

  describe('deals', () => {
    const board = makeBoard([TEST_DEAL]);
    const history = { items: [], hasMore: false };
    const clientDeals = { items: [TEST_DEAL], hasMore: false };

    it('should fill the keys the hooks read when every deal query answers 200', async () => {
      countRequests('/api/deals/board', () => HttpResponse.json(board));
      countRequests(`/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(TEST_DEAL));
      countRequests(`/api/deals/${TEST_DEAL.id}/history`, () => HttpResponse.json(history));
      countRequests('/api/deals', () => HttpResponse.json(clientDeals));
      const queryClient = createQueryClient();
      const request = await requestWith(await createAccessToken());

      await Promise.all([
        prefetchBoard(queryClient, request, { assignee: null }),
        prefetchDeal(queryClient, request, TEST_DEAL.id),
        prefetchDealHistory(queryClient, request, TEST_DEAL.id),
        prefetchStages(queryClient, request),
        prefetchMembers(queryClient, request),
        prefetchClientDeals(queryClient, request, TEST_CLIENT.id),
      ]);

      expect(queryClient.getQueryData(dealKeys.board({ assignee: null }))).toEqual(board);
      expect(queryClient.getQueryData(dealKeys.detail(TEST_DEAL.id))).toEqual(TEST_DEAL);
      expect(queryClient.getQueryData(dealKeys.history(TEST_DEAL.id))).toEqual(history);
      expect(queryClient.getQueryData(stageKeys.list)).toEqual(TEST_STAGES);
      expect(queryClient.getQueryData(memberKeys.list)).toEqual(TEST_MEMBERS);
      expect(queryClient.getQueryData(dealKeys.byClient(TEST_CLIENT.id))).toEqual(clientDeals);
      expect(writtenLines()).toEqual([]);
    });

    it('should fill the key the client hook builds when the URL has a member id', async () => {
      const memberId = TEST_SESSION.user.id;
      const counter = countRequests('/api/deals/board', () => HttpResponse.json(board));
      const queryClient = createQueryClient();
      const filters = await loadBoardFilters(Promise.resolve({ assignee: memberId }));

      await prefetchBoard(queryClient, await requestWith(await createAccessToken()), filters);

      expect(queryClient.getQueryData(dealKeys.board({ assignee: memberId }))).toEqual(board);
      expect(counter.urls.map((url) => new URL(url).search)).toEqual([`?assignee=${memberId}`]);
    });

    it('should filter nothing when the URL still has the old mine=true', async () => {
      expect(await loadBoardFilters(Promise.resolve({ mine: 'true' }))).toEqual({ assignee: null });
    });

    it('should log one warning with the label when the board fails', async () => {
      countRequests('/api/deals/board', () => problemResponse(503, 'SERVICE_UNAVAILABLE'));

      await prefetchBoard(createQueryClient(), await requestWith(await createAccessToken()), {
        assignee: null,
      });

      const lines = writtenLines();
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        msg: 'Board prefetch failed',
        reason: 'http',
        status: 503,
      });
    });

    it('should log nothing when the deal is not found', async () => {
      const counter = countRequests(`/api/deals/${TEST_DEAL.id}`, () =>
        problemResponse(404, 'DEAL_NOT_FOUND'),
      );

      await prefetchDeal(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        TEST_DEAL.id,
      );

      expect(counter.count).toBe(1);
      expect(writtenLines()).toEqual([]);
    });
  });

  describe('tasks', () => {
    const page = makeTaskPage([TEST_TASK]);

    function asInfinite(data: unknown): unknown {
      return { pages: [data], pageParams: [null] };
    }

    it('should fill the key the client hook builds when the URL has assignee=anyone and status=done', async () => {
      const counter = countRequests('/api/tasks', () => HttpResponse.json(page));
      const queryClient = createQueryClient();
      const filters = await loadTaskFilters(
        Promise.resolve({ assignee: 'anyone', status: 'done' }),
      );

      await prefetchTaskList(queryClient, await requestWith(await createAccessToken()), filters);

      const key = taskKeys.list({ assignee: null, status: 'done' });
      expect(queryClient.getQueryData(key)).toEqual(asInfinite(page));
      expect(counter.urls.map((url) => new URL(url).search)).toEqual(['?status=done']);
    });

    it('should ask for my open tasks when the URL has no filters', async () => {
      const counter = countRequests('/api/tasks', () => HttpResponse.json(page));
      const queryClient = createQueryClient();

      await prefetchTaskList(
        queryClient,
        await requestWith(await createAccessToken()),
        await loadTaskFilters({}),
      );

      expect(queryClient.getQueryData(taskKeys.list({ assignee: 'me', status: 'open' }))).toEqual(
        asInfinite(page),
      );
      expect(counter.urls.map((url) => new URL(url).search)).toEqual(['?assignee=me']);
    });

    it('should fill the keys the sections, the task page and the bell read when every query answers 200', async () => {
      const counter = countRequests('/api/tasks', () => HttpResponse.json(page));
      countRequests(`/api/tasks/${TEST_TASK.id}`, () => HttpResponse.json(TEST_TASK));
      countRequests('/api/notifications/unread-count', () => HttpResponse.json({ count: 3 }));
      const queryClient = createQueryClient();
      const request = await requestWith(await createAccessToken());
      const clientTasks = taskSectionFilters({ clientId: TEST_CLIENT.id });
      const dealTasks = taskSectionFilters({ dealId: TEST_DEAL.id });

      await Promise.all([
        prefetchTaskList(queryClient, request, clientTasks),
        prefetchTaskList(queryClient, request, dealTasks),
        prefetchTask(queryClient, request, TEST_TASK.id),
        prefetchUnreadCount(queryClient, request),
      ]);

      expect(queryClient.getQueryData(taskKeys.list(clientTasks))).toEqual(asInfinite(page));
      expect(queryClient.getQueryData(taskKeys.list(dealTasks))).toEqual(asInfinite(page));
      expect(queryClient.getQueryData(taskKeys.detail(TEST_TASK.id))).toEqual(TEST_TASK);
      expect(queryClient.getQueryData(notificationKeys.unreadCount)).toEqual({ count: 3 });
      expect(counter.urls.map((url) => new URL(url).search).toSorted()).toEqual([
        `?clientId=${TEST_CLIENT.id}`,
        `?dealId=${TEST_DEAL.id}`,
      ]);
      expect(writtenLines()).toEqual([]);
    });

    it('should log nothing when the task is not found', async () => {
      const counter = countRequests(`/api/tasks/${TEST_TASK.id}`, () =>
        problemResponse(404, 'TASK_NOT_FOUND'),
      );

      await prefetchTask(
        createQueryClient(),
        await requestWith(await createAccessToken()),
        TEST_TASK.id,
      );

      expect(counter.count).toBe(1);
      expect(writtenLines()).toEqual([]);
    });
  });
});
