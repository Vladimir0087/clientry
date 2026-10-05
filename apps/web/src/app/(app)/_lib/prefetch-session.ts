import 'server-only';

import type { QueryClient } from '@tanstack/react-query';

import { sessionKeys } from '@/entities/session';
import { serverGet } from '@/shared/api/server-client';
import type { CookieReader } from '@/shared/api/server-client';
import type { AccessSession } from '@/shared/lib/verify-access-token';
import { sessionResponseSchema } from '@clientry/shared/auth';

const PREFETCH_TIMEOUT_MS = 1000;

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
    // Deliberately swallowed: the page renders without the data, and the client query refetches
    // (refreshing if needed) and shows its own error state.
    .catch(() => undefined);
}
