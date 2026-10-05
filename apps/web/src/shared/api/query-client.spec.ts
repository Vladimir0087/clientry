import { onlineManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from './api-error';
import { NetworkError } from './network-error';
import { createQueryClient } from './query-client';
import { ResponseContractError } from './response-contract-error';
import { SessionExpiredError } from './session-expired-error';

function apiError(status: number): ApiError {
  return new ApiError({ status, code: 'TEST' });
}

async function countQueryAttempts(error: Error): Promise<number> {
  const queryClient = createQueryClient();
  const queryFn = vi.fn().mockRejectedValue(error);

  await queryClient.query({ queryKey: ['test'], queryFn, retryDelay: 0 }).catch(() => undefined);

  return queryFn.mock.calls.length;
}

describe('createQueryClient', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it.each([
    ['a NetworkError', new NetworkError('/api/test', new TypeError('fetch failed'))],
    ['a 503', apiError(503)],
  ])('should retry a query twice when it fails with %s', async (_name, error) => {
    const attempts = await countQueryAttempts(error);

    expect(attempts).toBe(3);
  });

  it.each([
    ['a 400', apiError(400)],
    ['a 401', apiError(401)],
    ['a 404', apiError(404)],
    ['a ResponseContractError', new ResponseContractError('/api/test', new z.ZodError([]))],
    ['a SessionExpiredError', new SessionExpiredError()],
  ])('should not retry a query when it fails with %s', async (_name, error) => {
    const attempts = await countQueryAttempts(error);

    expect(attempts).toBe(1);
  });

  it('should fail a query after its retries instead of pausing when the browser is offline', async () => {
    onlineManager.setOnline(false);

    const attempts = await countQueryAttempts(new NetworkError('/api/test', new TypeError()));

    expect(attempts).toBe(3);
  });

  it('should refetch a stale query when the browser comes back online', async () => {
    const queryClient = createQueryClient();
    // QueryClientProvider mounts the client, which subscribes it to online events.
    queryClient.mount();
    const queryFn = vi.fn().mockResolvedValue('data');
    const observer = new QueryObserver(queryClient, { queryKey: ['test'], queryFn, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    onlineManager.setOnline(false);
    onlineManager.setOnline(true);

    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
    unsubscribe();
    queryClient.unmount();
  });

  it('should not retry a mutation when it fails with a NetworkError', async () => {
    const queryClient = createQueryClient();
    const mutationFn = vi.fn().mockRejectedValue(new NetworkError('/api/test', new TypeError()));
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn });

    await mutation.execute(undefined).catch(() => undefined);

    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('should run a mutation and reject with its error when the browser is offline', async () => {
    onlineManager.setOnline(false);
    const queryClient = createQueryClient();
    const error = new NetworkError('/api/test', new TypeError('offline'));
    const mutationFn = vi.fn().mockRejectedValue(error);
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn });

    const result = mutation.execute(undefined);

    await expect(result).rejects.toBe(error);
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('should call the session-expired handler once when two queries and a mutation fail at once', async () => {
    const onSessionExpired = vi.fn();
    const queryClient = createQueryClient({ onSessionExpired });
    const expire = (): Promise<never> => Promise.reject(new SessionExpiredError());
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: expire });

    await Promise.allSettled([
      queryClient.query({ queryKey: ['a'], queryFn: expire }),
      queryClient.query({ queryKey: ['b'], queryFn: expire }),
      mutation.execute(undefined),
    ]);

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('should not call the session-expired handler when a query fails with another error', async () => {
    const onSessionExpired = vi.fn();
    const queryClient = createQueryClient({ onSessionExpired });

    await queryClient
      .query({ queryKey: ['a'], queryFn: () => Promise.reject(apiError(404)) })
      .catch(() => undefined);

    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
