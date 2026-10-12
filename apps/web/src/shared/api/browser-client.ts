import type { z } from 'zod';

import { sessionResponseSchema } from '@clientry/shared/auth';

import { ApiError } from './api-error';
import type { ApiPath } from './api-path';
import { parseSuccessBody, toApiError } from './read-response';
import { sendRequest } from './send-request';
import { SessionExpiredError } from './session-expired-error';

const REFRESH_PATH = '/api/auth/refresh';
const AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED';
const UNAUTHORIZED = 401;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

// One per tab: every request that hits an expired token while it runs waits for it.
let refreshInFlight: Promise<void> | undefined;
// A 401 can come back after a refresh that started later; that request only needs a retry.
let finishedRefreshes = 0;

async function sendOk(
  path: ApiPath,
  { method = 'GET', body, signal }: ApiRequestOptions,
): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await sendRequest(path, path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

function isAuthenticationRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === UNAUTHORIZED &&
    error.code === AUTHENTICATION_REQUIRED
  );
}

async function refresh(): Promise<void> {
  try {
    const response = await sendOk(REFRESH_PATH, { method: 'POST' });
    await parseSuccessBody(response, sessionResponseSchema, REFRESH_PATH);
  } catch (error) {
    // Anything but a 401 (rate limit, 5xx, offline) leaves the session alive.
    if (error instanceof ApiError && error.status === UNAUTHORIZED) {
      throw new SessionExpiredError({ cause: error });
    }
    throw error;
  }
}

function refreshOnce(): Promise<void> {
  refreshInFlight ??= refresh()
    .then(() => {
      finishedRefreshes += 1;
    })
    .finally(() => {
      refreshInFlight = undefined;
    });
  return refreshInFlight;
}

async function retryAfterRefresh(path: ApiPath, options: ApiRequestOptions): Promise<Response> {
  try {
    return await sendOk(path, options);
  } catch (error) {
    if (isAuthenticationRequired(error)) {
      throw new SessionExpiredError({ cause: error });
    }
    throw error;
  }
}

// A 204 parses as undefined, so a call without a body names z.undefined().
export async function apiRequest<T>(
  path: ApiPath,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const refreshesBeforeSend = finishedRefreshes;
  let response: Response;
  try {
    response = await sendOk(path, options);
  } catch (error) {
    if (!isAuthenticationRequired(error)) {
      throw error;
    }
    if (finishedRefreshes === refreshesBeforeSend) {
      await refreshOnce();
    }
    response = await retryAfterRefresh(path, options);
  }
  return parseSuccessBody(response, schema, path);
}
