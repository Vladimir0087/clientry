import 'server-only';

import type { QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { activityFeedPath, activityKeys } from '@/entities/activity';
import { clientKeys, clientListPath } from '@/entities/client';
import type { ClientFilters } from '@/entities/client';
import { DASHBOARD_SUMMARY_PATH, dashboardKeys } from '@/entities/dashboard';
import { boardPath, dealKeys, stageKeys } from '@/entities/deal';
import type { BoardFilters } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { notificationKeys } from '@/entities/notification';
import { sessionKeys } from '@/entities/session';
import { taskKeys, taskListPath } from '@/entities/task';
import type { TaskFilters } from '@/entities/task';
import { ApiError } from '@/shared/api/api-error';
import type { ApiPath } from '@/shared/api/api-path';
import { isNotFound } from '@/shared/api/api-status';
import { NetworkError } from '@/shared/api/network-error';
import { ResponseContractError } from '@/shared/api/response-contract-error';
import { serverGet } from '@/shared/api/server-client';
import type { CookieReader } from '@/shared/api/server-client';
import { writeServerLog } from '@/shared/lib/server-log';
import type { ServerLogFields } from '@/shared/lib/server-log';
import type { AccessSession } from '@/shared/lib/verify-access-token';
import { activityFeedResponseSchema } from '@clientry/shared/activity';
import { sessionResponseSchema } from '@clientry/shared/auth';
import { clientListResponseSchema, clientResponseSchema } from '@clientry/shared/clients';
import { dashboardSummaryResponseSchema } from '@clientry/shared/dashboard';
import {
  boardResponseSchema,
  dealHistoryResponseSchema,
  dealListResponseSchema,
  dealSchema,
  stageListResponseSchema,
} from '@clientry/shared/deals';
import { unreadCountResponseSchema } from '@clientry/shared/notifications';
import { taskListResponseSchema, taskSchema } from '@clientry/shared/tasks';
import { memberListResponseSchema } from '@clientry/shared/workspaces';
import type { MemberFilter } from '@clientry/shared/workspaces';

const PREFETCH_TIMEOUT_MS = 1000;

export interface PrefetchRequest {
  readonly cookies: CookieReader;
  readonly session: AccessSession;
}

type ServerFetch = <T>(path: ApiPath, schema: z.ZodType<T>, signal: AbortSignal) => Promise<T>;

interface PrefetchOptions {
  readonly label: string;
  // Outcomes that are not failures, such as a link to a deleted client.
  readonly isExpected?: (error: unknown) => boolean;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

// Fields only, never the error or the request: the request carries the access cookie.
function describeFailure(error: unknown): ServerLogFields {
  if (error instanceof ApiError) {
    const { status, code, requestId } = error;
    return { reason: 'http', status, code, requestId };
  }
  if (isTimeout(error)) {
    return { reason: 'timeout' };
  }
  if (error instanceof NetworkError) {
    return { reason: 'network' };
  }
  if (error instanceof ResponseContractError) {
    return { reason: 'contract' };
  }
  return { reason: 'unexpected' };
}

// One attempt within a second; a failure is logged, then swallowed: the page renders without
// the data, and the browser query refetches (refreshing if needed) and shows its own error state.
async function prefetch(
  { cookies, session }: PrefetchRequest,
  { label, isExpected }: PrefetchOptions,
  start: (fetch: ServerFetch) => Promise<unknown>,
): Promise<void> {
  if (session.status !== 'authenticated') {
    return;
  }
  const fetch: ServerFetch = (path, schema, signal) =>
    serverGet(path, schema, {
      cookies,
      signal: AbortSignal.any([signal, AbortSignal.timeout(PREFETCH_TIMEOUT_MS)]),
    });
  await start(fetch).catch((error: unknown) => {
    if (isExpected?.(error) !== true) {
      writeServerLog('warn', `${label} prefetch failed`, describeFailure(error));
    }
  });
}

export function prefetchSession(queryClient: QueryClient, request: PrefetchRequest): Promise<void> {
  return prefetch(request, { label: 'Session' }, (fetch) =>
    queryClient.query({
      queryKey: sessionKeys.current,
      queryFn: ({ signal }) => fetch('/api/auth/me', sessionResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchClientList(
  queryClient: QueryClient,
  request: PrefetchRequest,
  filters: ClientFilters,
): Promise<void> {
  return prefetch(request, { label: 'Client list' }, (fetch) =>
    queryClient.infiniteQuery({
      queryKey: clientKeys.list(filters),
      queryFn: ({ signal }) =>
        fetch(clientListPath(filters, null), clientListResponseSchema, signal),
      initialPageParam: null,
      retry: false,
    }),
  );
}

export function prefetchClient(
  queryClient: QueryClient,
  request: PrefetchRequest,
  id: string,
): Promise<void> {
  return prefetch(request, { label: 'Client', isExpected: isNotFound }, (fetch) =>
    queryClient.query({
      queryKey: clientKeys.detail(id),
      queryFn: ({ signal }) => fetch(`/api/clients/${id}`, clientResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchBoard(
  queryClient: QueryClient,
  request: PrefetchRequest,
  filters: BoardFilters,
): Promise<void> {
  return prefetch(request, { label: 'Board' }, (fetch) =>
    queryClient.query({
      queryKey: dealKeys.board(filters),
      queryFn: ({ signal }) => fetch(boardPath(filters), boardResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchDeal(
  queryClient: QueryClient,
  request: PrefetchRequest,
  id: string,
): Promise<void> {
  return prefetch(request, { label: 'Deal', isExpected: isNotFound }, (fetch) =>
    queryClient.query({
      queryKey: dealKeys.detail(id),
      queryFn: ({ signal }) => fetch(`/api/deals/${id}`, dealSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchDealHistory(
  queryClient: QueryClient,
  request: PrefetchRequest,
  id: string,
): Promise<void> {
  return prefetch(request, { label: 'Deal history', isExpected: isNotFound }, (fetch) =>
    queryClient.query({
      queryKey: dealKeys.history(id),
      queryFn: ({ signal }) => fetch(`/api/deals/${id}/history`, dealHistoryResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchClientDeals(
  queryClient: QueryClient,
  request: PrefetchRequest,
  clientId: string,
): Promise<void> {
  const query = new URLSearchParams({ clientId }).toString();
  return prefetch(request, { label: 'Client deals' }, (fetch) =>
    queryClient.query({
      queryKey: dealKeys.byClient(clientId),
      queryFn: ({ signal }) => fetch(`/api/deals?${query}`, dealListResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchStages(queryClient: QueryClient, request: PrefetchRequest): Promise<void> {
  return prefetch(request, { label: 'Stages' }, (fetch) =>
    queryClient.query({
      queryKey: stageKeys.list,
      queryFn: ({ signal }) => fetch('/api/stages', stageListResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchMembers(queryClient: QueryClient, request: PrefetchRequest): Promise<void> {
  return prefetch(request, { label: 'Members' }, (fetch) =>
    queryClient.query({
      queryKey: memberKeys.list,
      queryFn: ({ signal }) => fetch('/api/members', memberListResponseSchema, signal),
      retry: false,
    }),
  );
}

// With a member id in the URL the menu trigger names the member from the first render. The
// caller's own id reads as "Me", which needs no names.
export function prefetchFilterMembers(
  queryClient: QueryClient,
  request: PrefetchRequest,
  filter: MemberFilter | null,
): Promise<void> {
  const { session } = request;
  const ownId = session.status === 'authenticated' ? session.claims.sub : null;
  return filter === null || filter === 'me' || filter === ownId
    ? Promise.resolve()
    : prefetchMembers(queryClient, request);
}

export function prefetchTaskList(
  queryClient: QueryClient,
  request: PrefetchRequest,
  filters: TaskFilters,
): Promise<void> {
  return prefetch(request, { label: 'Task list' }, (fetch) =>
    queryClient.infiniteQuery({
      queryKey: taskKeys.list(filters),
      queryFn: ({ signal }) => fetch(taskListPath(filters, null), taskListResponseSchema, signal),
      initialPageParam: null,
      retry: false,
    }),
  );
}

export function prefetchTask(
  queryClient: QueryClient,
  request: PrefetchRequest,
  id: string,
): Promise<void> {
  return prefetch(request, { label: 'Task', isExpected: isNotFound }, (fetch) =>
    queryClient.query({
      queryKey: taskKeys.detail(id),
      queryFn: ({ signal }) => fetch(`/api/tasks/${id}`, taskSchema, signal),
      retry: false,
    }),
  );
}

// From the server function to the API directly, so the badge is in the first HTML without a
// call through the /api rewrite.
export function prefetchUnreadCount(
  queryClient: QueryClient,
  request: PrefetchRequest,
): Promise<void> {
  return prefetch(request, { label: 'Unread count' }, (fetch) =>
    queryClient.query({
      queryKey: notificationKeys.unreadCount,
      queryFn: ({ signal }) =>
        fetch('/api/notifications/unread-count', unreadCountResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchDashboardSummary(
  queryClient: QueryClient,
  request: PrefetchRequest,
): Promise<void> {
  return prefetch(request, { label: 'Dashboard summary' }, (fetch) =>
    queryClient.query({
      queryKey: dashboardKeys.summary,
      queryFn: ({ signal }) =>
        fetch(DASHBOARD_SUMMARY_PATH, dashboardSummaryResponseSchema, signal),
      retry: false,
    }),
  );
}

export function prefetchActivityFeed(
  queryClient: QueryClient,
  request: PrefetchRequest,
): Promise<void> {
  return prefetch(request, { label: 'Activity feed' }, (fetch) =>
    queryClient.infiniteQuery({
      queryKey: activityKeys.feed,
      queryFn: ({ signal }) => fetch(activityFeedPath(null), activityFeedResponseSchema, signal),
      initialPageParam: null,
      retry: false,
    }),
  );
}
