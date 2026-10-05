import 'server-only';

import type { z } from 'zod';

import { getWebEnv } from '@/shared/config/env';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import type { ApiPath } from './api-path';
import { parseSuccessBody, toApiError } from './read-response';
import { sendRequest } from './send-request';

export interface CookieReader {
  get(name: string): { readonly value: string } | undefined;
}

interface ServerRequestOptions {
  readonly cookies: CookieReader;
  readonly signal?: AbortSignal;
}

// For prefetch only: never refreshes, so a 401 just leaves the fetch to the browser client.
export async function serverGet<T>(
  path: ApiPath,
  schema: z.ZodType<T>,
  { cookies, signal }: ServerRequestOptions,
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  const accessToken = cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken !== undefined) {
    headers.set('Cookie', `${ACCESS_TOKEN_COOKIE}=${accessToken}`);
  }
  const url = `${getWebEnv().apiUrl}${path}`;
  const response = await sendRequest(url, path, { headers, cache: 'no-store', signal });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return parseSuccessBody(response, schema, path);
}
