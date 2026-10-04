import type { CookieOptions, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@clientry/shared/auth';

import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

describe('AuthController', () => {
  it('should clear both cookies and rethrow when revoking the session fails', async () => {
    const failure = new Error('connection lost');
    const auth = {
      logout: vi.fn<AuthService['logout']>().mockRejectedValue(failure),
    } satisfies Pick<AuthService, 'logout'>;
    // satisfies keeps the mock in step with the real class; the cast only drops the other members.
    const controller = new AuthController(
      auth as unknown as AuthService,
      new AuthCookies(createUnitConfig()),
    );
    const cookie = vi.fn<(name: string, value: string, options: CookieOptions) => void>();
    const request = { cookies: { [REFRESH_TOKEN_COOKIE]: 'refresh-token' } } as unknown as Request;

    const logout = controller.logout(request, { cookie } as unknown as Response);

    await expect(logout).rejects.toBe(failure);
    const cleared = cookie.mock.calls.map(([name, value, { maxAge }]) => ({ name, value, maxAge }));
    expect(cleared).toEqual([
      { name: ACCESS_TOKEN_COOKIE, value: '', maxAge: 0 },
      { name: REFRESH_TOKEN_COOKIE, value: '', maxAge: 0 },
    ]);
  });
});
