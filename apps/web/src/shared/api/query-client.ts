import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';
import { NetworkError } from './network-error';
import { SessionExpiredError } from './session-expired-error';

const STALE_TIME_MS = 60_000;
const MAX_RETRIES = 2;
const SERVER_ERROR = 500;

export interface QueryClientOptions {
  readonly onSessionExpired?: () => void;
}

// Only failures that a sleeping or restarting API produces are worth another attempt.
function shouldRetry(failureCount: number, error: unknown): boolean {
  const isTransient =
    error instanceof NetworkError || (error instanceof ApiError && error.status >= SERVER_ERROR);
  return isTransient && failureCount < MAX_RETRIES;
}

export function createQueryClient({ onSessionExpired }: QueryClientOptions = {}): QueryClient {
  let hasSessionExpired = false;
  const handleError = (error: unknown): void => {
    if (!(error instanceof SessionExpiredError) || hasSessionExpired) {
      return;
    }
    hasSessionExpired = true;
    onSessionExpired?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      // Offline, a paused request would leave a skeleton or a spinner; a failed one shows its error.
      queries: {
        staleTime: STALE_TIME_MS,
        retry: shouldRetry,
        networkMode: 'always',
        // TanStack turns reconnect refetches off for 'always' unless asked.
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
