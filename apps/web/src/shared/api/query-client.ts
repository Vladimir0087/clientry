import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';
import { NetworkError } from './network-error';
import { SessionExpiredError } from './session-expired-error';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { readonly isSessionEnd?: boolean };
  }
}

const STALE_TIME_MS = 60_000;
const MAX_RETRIES = 2;
const SERVER_ERROR = 500;

export interface QueryClientOptions {
  readonly onSessionExpired?: () => void;
  // Runs after every successful mutation, whichever feature made it, except one that ends the
  // session: refetches it starts would hit 401 and log out a second time.
  readonly onMutationSuccess?: (queryClient: QueryClient) => void;
}

// Only failures that a sleeping or restarting API produces are worth another attempt.
function shouldRetry(failureCount: number, error: unknown): boolean {
  const isTransient =
    error instanceof NetworkError || (error instanceof ApiError && error.status >= SERVER_ERROR);
  return isTransient && failureCount < MAX_RETRIES;
}

export function createQueryClient({
  onSessionExpired,
  onMutationSuccess,
}: QueryClientOptions = {}): QueryClient {
  let hasSessionExpired = false;
  const handleError = (error: unknown): void => {
    if (!(error instanceof SessionExpiredError) || hasSessionExpired) {
      return;
    }
    hasSessionExpired = true;
    onSessionExpired?.();
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({
      onError: handleError,
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.isSessionEnd === true) {
          return;
        }
        onMutationSuccess?.(queryClient);
      },
    }),
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
  return queryClient;
}
