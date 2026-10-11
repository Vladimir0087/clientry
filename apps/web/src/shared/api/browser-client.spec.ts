import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { sessionResponseSchema } from '@clientry/shared/auth';

import { ApiError, UNEXPECTED_RESPONSE } from './api-error';
import { apiRequest } from './browser-client';
import { NetworkError } from './network-error';
import { ResponseContractError } from './response-contract-error';
import { SessionExpiredError } from './session-expired-error';
import { TEST_SESSION } from '../../../test/fixtures';
import { problemResponse } from '../../../test/msw/problem';
import { server } from '../../../test/msw/server';

const ME = '/api/auth/me';
const REFRESH_DELAY_MS = 20;

interface RequestCounts {
  me: number;
  refresh: number;
}

type RefreshResponse = () => Response | Promise<Response>;

// /me answers 401 AUTHENTICATION_REQUIRED until a refresh succeeds, or always when it is stuck.
function expiringSession(
  refreshResponse: RefreshResponse = () => HttpResponse.json(TEST_SESSION),
  { isStuck = false } = {},
): RequestCounts {
  const counts: RequestCounts = { me: 0, refresh: 0 };
  let isRefreshed = false;
  server.use(
    http.get(`*${ME}`, () => {
      counts.me += 1;
      return isRefreshed && !isStuck
        ? HttpResponse.json(TEST_SESSION)
        : problemResponse(401, 'AUTHENTICATION_REQUIRED');
    }),
    http.post('*/api/auth/refresh', async () => {
      counts.refresh += 1;
      await delay(REFRESH_DELAY_MS);
      const response = await refreshResponse();
      isRefreshed = response.status === 200;
      return response;
    }),
  );
  return counts;
}

function getSession(): Promise<unknown> {
  return apiRequest(ME, sessionResponseSchema);
}

describe('apiRequest', () => {
  it('should return the parsed body when the response matches its schema', async () => {
    const session = await getSession();

    expect(session).toEqual(TEST_SESSION);
  });

  it('should resolve to undefined when the response is a 204', async () => {
    const result = apiRequest('/api/auth/logout', z.undefined(), { method: 'POST' });

    await expect(result).resolves.toBeUndefined();
  });

  it('should send a JSON body with JSON headers when a body is given', async () => {
    let received: Request | undefined;
    server.use(
      http.post('*/api/auth/login', ({ request }) => {
        received = request.clone();
        return HttpResponse.json(TEST_SESSION);
      }),
    );

    await apiRequest('/api/auth/login', sessionResponseSchema, {
      method: 'POST',
      body: { email: 'ann@example.com', password: 'secret' },
    });

    expect(received?.headers.get('content-type')).toBe('application/json');
    expect(received?.headers.get('accept')).toBe('application/json');
    expect(await received?.json()).toEqual({ email: 'ann@example.com', password: 'secret' });
  });

  it('should throw an ApiError with every field when the API answers problem details', async () => {
    const errors = [{ path: 'email', message: 'Enter a valid email' }];
    server.use(
      http.get(`*${ME}`, () =>
        problemResponse(429, 'TOO_MANY_REQUESTS', {
          requestId: 'req-429',
          detail: 'Slow down',
          errors,
          headers: { 'Retry-After': '30' },
        }),
      ),
    );

    const result = getSession();

    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      detail: 'Slow down',
      requestId: 'req-429',
      errors,
      retryAfterSeconds: 30,
    });
  });

  it('should throw UNEXPECTED_RESPONSE with the real status and request id when the body is HTML', async () => {
    server.use(
      http.get(
        `*${ME}`,
        () =>
          new HttpResponse('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'req-502' },
          }),
      ),
    );

    await expect(getSession()).rejects.toMatchObject({
      status: 502,
      code: UNEXPECTED_RESPONSE,
      requestId: 'req-502',
    });
  });

  it('should throw a NetworkError when the connection is refused', async () => {
    server.use(http.get(`*${ME}`, () => HttpResponse.error()));

    await expect(getSession()).rejects.toBeInstanceOf(NetworkError);
  });

  it('should throw a ResponseContractError when a success body is off its schema', async () => {
    server.use(http.get(`*${ME}`, () => HttpResponse.json({ user: null })));

    await expect(getSession()).rejects.toBeInstanceOf(ResponseContractError);
  });

  it('should refresh once and retry once when the access token has expired', async () => {
    const counts = expiringSession();

    const session = await getSession();

    expect(session).toEqual(TEST_SESSION);
    expect(counts).toEqual({ me: 2, refresh: 1 });
  });

  it('should share one refresh when three requests get 401 at once', async () => {
    const counts = expiringSession();

    const sessions = await Promise.all([getSession(), getSession(), getSession()]);

    expect(sessions).toEqual([TEST_SESSION, TEST_SESSION, TEST_SESSION]);
    expect(counts).toEqual({ me: 6, refresh: 1 });
  });

  it('should fail every waiting request with SessionExpiredError when the refresh answers 401', async () => {
    const counts = expiringSession(() => problemResponse(401, 'INVALID_REFRESH_TOKEN'));

    const results = await Promise.allSettled([getSession(), getSession(), getSession()]);

    const isExpired = results.map(
      (result) => result.status === 'rejected' && result.reason instanceof SessionExpiredError,
    );
    expect(isExpired).toEqual([true, true, true]);
    expect(counts).toEqual({ me: 3, refresh: 1 });
  });

  it('should throw SessionExpiredError without a second refresh when the retry gets 401 again', async () => {
    const counts = expiringSession(undefined, { isStuck: true });

    await expect(getSession()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(counts).toEqual({ me: 2, refresh: 1 });
  });

  it.each([
    ['429', () => problemResponse(429, 'TOO_MANY_REQUESTS'), ApiError],
    ['403', () => problemResponse(403, 'UNTRUSTED_ORIGIN'), ApiError],
    ['503', () => problemResponse(503, 'SERVICE_UNAVAILABLE'), ApiError],
    ['a network error', () => HttpResponse.error(), NetworkError],
    ['a body off its schema', () => HttpResponse.json({ user: null }), ResponseContractError],
  ])(
    'should fail with the refresh error, not SessionExpiredError, when the refresh answers %s',
    async (_name, refreshResponse, errorClass) => {
      const counts = expiringSession(refreshResponse);

      const result = getSession();

      await expect(result).rejects.toBeInstanceOf(errorClass);
      await expect(result).rejects.not.toBeInstanceOf(SessionExpiredError);
      expect(counts).toEqual({ me: 1, refresh: 1 });
    },
  );

  it('should not refresh when a 401 is INVALID_CREDENTIALS', async () => {
    const counts = expiringSession();
    server.use(http.post('*/api/auth/login', () => problemResponse(401, 'INVALID_CREDENTIALS')));

    const result = apiRequest('/api/auth/login', sessionResponseSchema, {
      method: 'POST',
      body: {},
    });

    await expect(result).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(counts.refresh).toBe(0);
  });

  it('should retry without a second refresh when a 401 for the old token lands after the refresh', async () => {
    let isRefreshed = false;
    let expiredRequests = 0;
    let refreshes = 0;
    server.use(
      http.get(`*${ME}`, async () => {
        if (isRefreshed) {
          return HttpResponse.json(TEST_SESSION);
        }
        expiredRequests += 1;
        // The second request carried the old token too, but its 401 is slow to come back.
        if (expiredRequests === 2) {
          await delay(REFRESH_DELAY_MS * 5);
        }
        return problemResponse(401, 'AUTHENTICATION_REQUIRED');
      }),
      http.post('*/api/auth/refresh', async () => {
        refreshes += 1;
        await delay(REFRESH_DELAY_MS);
        isRefreshed = true;
        return HttpResponse.json(TEST_SESSION);
      }),
    );

    const sessions = await Promise.all([getSession(), getSession()]);

    expect(sessions).toEqual([TEST_SESSION, TEST_SESSION]);
    expect(refreshes).toBe(1);
  });

  it('should start a new refresh when a 401 comes after the previous refresh finished', async () => {
    const counts = expiringSession(undefined, { isStuck: true });
    await getSession().catch(() => undefined);

    await expect(getSession()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(counts.refresh).toBe(2);
  });

  it('should reject with the abort error, not NetworkError, when the signal aborts', async () => {
    server.use(
      http.get(`*${ME}`, async () => {
        await delay('infinite');
        return HttpResponse.json(TEST_SESSION);
      }),
    );
    const controller = new AbortController();

    const result = apiRequest(ME, sessionResponseSchema, { signal: controller.signal });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await expect(result).rejects.not.toBeInstanceOf(NetworkError);
  });
});
