import 'server-only';

import type { QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { clientKeys, clientListPath, isNotFound } from '@/entities/client';
import type { ClientFilters } from '@/entities/client';
import { sessionKeys } from '@/entities/session';
import { ApiError } from '@/shared/api/api-error';
import type { ApiPath } from '@/shared/api/api-path';
import { NetworkError } from '@/shared/api/network-error';
import { ResponseContractError } from '@/shared/api/response-contract-error';
import { serverGet } from '@/shared/api/server-client';
import type { CookieReader } from '@/shared/api/server-client';
import { writeServerLog } from '@/shared/lib/server-log';
import type { ServerLogFields } from '@/shared/lib/server-log';
import type { AccessSession } from '@/shared/lib/verify-access-token';
import { sessionResponseSchema } from '@clientry/shared/auth';
import { clientListResponseSchema, clientResponseSchema } from '@clientry/shared/clients';

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
