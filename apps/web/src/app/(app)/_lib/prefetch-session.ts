import 'server-only';

import type { QueryClient } from '@tanstack/react-query';

import { sessionKeys } from '@/entities/session';
import { ApiError } from '@/shared/api/api-error';
import { NetworkError } from '@/shared/api/network-error';
import { ResponseContractError } from '@/shared/api/response-contract-error';
import { serverGet } from '@/shared/api/server-client';
import type { CookieReader } from '@/shared/api/server-client';
import { writeServerLog } from '@/shared/lib/server-log';
import type { ServerLogFields } from '@/shared/lib/server-log';
import type { AccessSession } from '@/shared/lib/verify-access-token';
import { sessionResponseSchema } from '@clientry/shared/auth';

const PREFETCH_TIMEOUT_MS = 1000;

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

export async function prefetchSession(
  queryClient: QueryClient,
  cookies: CookieReader,
  session: AccessSession,
): Promise<void> {
  if (session.status !== 'authenticated') {
    return;
  }
  await queryClient
    .query({
      queryKey: sessionKeys.current,
      queryFn: ({ signal }) =>
        serverGet('/api/auth/me', sessionResponseSchema, {
          cookies,
          signal: AbortSignal.any([signal, AbortSignal.timeout(PREFETCH_TIMEOUT_MS)]),
        }),
      retry: false,
    })
    // Logged, then swallowed: the page renders without the data, and the client query refetches
    // (refreshing if needed) and shows its own error state.
    .catch((error: unknown) => {
      writeServerLog('warn', 'Session prefetch failed', describeFailure(error));
    });
}
