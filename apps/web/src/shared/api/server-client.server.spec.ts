import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { sessionResponseSchema } from '@clientry/shared/auth';

import { ApiError, UNEXPECTED_RESPONSE } from './api-error';
import { serverGet } from './server-client';
import type { CookieReader } from './server-client';
import { TEST_API_URL, TEST_SESSION } from '../../../test/fixtures';
import { problemResponse } from '../../../test/msw/problem';
import { server } from '../../../test/msw/server';

const INCOMING_COOKIES: Readonly<Record<string, string>> = {
  clientry_access: 'access-jwt',
  clientry_refresh: 'refresh-token',
  theme: 'dark',
};

const cookies: CookieReader = {
  get: (name) => {
    const value = INCOMING_COOKIES[name];
    return value === undefined ? undefined : { value };
  },
};

function recordRequests(response: () => Response): Request[] {
  const requests: Request[] = [];
  server.use(
    http.all('*', ({ request }) => {
      requests.push(request);
      return response();
    }),
  );
  return requests;
}

describe('serverGet', () => {
  it('should send only the access cookie to API_URL without caching when other cookies come in', async () => {
    const requests = recordRequests(() => HttpResponse.json(TEST_SESSION));

    const session = await serverGet('/api/auth/me', sessionResponseSchema, { cookies });

    expect(session).toEqual(TEST_SESSION);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(`${TEST_API_URL}/api/auth/me`);
    expect(request?.headers.get('cookie')).toBe('clientry_access=access-jwt');
    expect(request?.cache).toBe('no-store');
  });

  it('should throw an ApiError without refreshing when the API answers 401', async () => {
    const requests = recordRequests(() => problemResponse(401, 'AUTHENTICATION_REQUIRED'));

    const result = serverGet('/api/auth/me', sessionResponseSchema, { cookies });

    await expect(result).rejects.toThrow(ApiError);
    await expect(result).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED' });
    expect(requests).toHaveLength(1);
  });

  it('should take the request id from the header when the error body is not problem details', async () => {
    recordRequests(
      () =>
        new HttpResponse('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'req-502' },
        }),
    );

    const result = serverGet('/api/auth/me', sessionResponseSchema, { cookies });

    await expect(result).rejects.toMatchObject({
      status: 502,
      code: UNEXPECTED_RESPONSE,
      requestId: 'req-502',
    });
  });
});
