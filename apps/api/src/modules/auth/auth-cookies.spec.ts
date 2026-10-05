import type { CookieOptions, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@clientry/shared/auth';

import { AuthCookies } from './auth-cookies.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

const REFRESH_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface CookieCall {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

function captureCookies(act: (response: Response) => void): CookieCall[] {
  const cookie = vi.fn<(name: string, value: string, options: CookieOptions) => void>();
  act({ cookie } as unknown as Response);
  return cookie.mock.calls.map(([name, value, options]) => ({ name, value, options }));
}

describe('AuthCookies', () => {
  it('should set both cookies with their attributes when a session is issued', () => {
    const cookies = new AuthCookies(createUnitConfig());

    const calls = captureCookies((response) => {
      cookies.set(response, {
        accessToken: 'access',
        refreshToken: 'refresh',
        maxAgeMs: REFRESH_MAX_AGE_MS,
      });
    });

    expect(calls).toEqual([
      {
        name: ACCESS_TOKEN_COOKIE,
        value: 'access',
        options: {
          path: '/',
          sameSite: 'lax',
          httpOnly: true,
          secure: false,
          maxAge: REFRESH_MAX_AGE_MS,
        },
      },
      {
        name: REFRESH_TOKEN_COOKIE,
        value: 'refresh',
        options: {
          path: '/api/auth',
          sameSite: 'strict',
          httpOnly: true,
          secure: false,
          maxAge: REFRESH_MAX_AGE_MS,
        },
      },
    ]);
  });

  it('should give the access cookie the refresh Max-Age when the session end caps it', () => {
    const cookies = new AuthCookies(createUnitConfig());

    const calls = captureCookies((response) => {
      cookies.set(response, { accessToken: 'a', refreshToken: 'r', maxAgeMs: 5000 });
    });

    expect(calls.map(({ options }) => options.maxAge)).toEqual([5000, 5000]);
  });

  it('should mark both cookies secure when NODE_ENV is production', () => {
    const cookies = new AuthCookies(createUnitConfig({ NODE_ENV: 'production' }));

    const calls = captureCookies((response) => {
      cookies.set(response, { accessToken: 'a', refreshToken: 'r', maxAgeMs: 1000 });
    });

    expect(calls.map(({ options }) => options.secure)).toEqual([true, true]);
  });

  it('should expire both cookies on their own paths when they are cleared', () => {
    const cookies = new AuthCookies(createUnitConfig());

    const calls = captureCookies((response) => {
      cookies.clear(response);
    });

    expect(calls).toMatchObject([
      { name: ACCESS_TOKEN_COOKIE, value: '', options: { path: '/', maxAge: 0 } },
      { name: REFRESH_TOKEN_COOKIE, value: '', options: { path: '/api/auth', maxAge: 0 } },
    ]);
  });
});
