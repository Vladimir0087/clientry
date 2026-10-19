import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { AccessTokenGuard } from './access-token.guard.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthenticationRequiredError } from './errors.js';
import type { SessionsRepository } from './sessions.repository.js';
import { createHttpContext } from '../../../test/support/http-context.js';
import type { FakeRequest, HttpContext } from '../../../test/support/http-context.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { getAuthUser } from '../../common/auth/auth-user.js';
import { Public } from '../../common/auth/public.decorator.js';

const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'owner',
  isDemo: false,
};

const SESSION_ID = '0199a3c4-5e71-7c2d-9e3f-4a5b6c7d8e9f';

@Controller('fixture')
class FixtureController {
  @Get('open')
  @Public()
  open(): void {
    // route body is irrelevant to guards
  }

  @Get('closed')
  closed(): void {
    // route body is irrelevant to guards
  }
}

describe('AccessTokenGuard', () => {
  const config = createUnitConfig();
  const tokens = new AccessTokenService(config);
  const findLiveMembership = vi.fn<SessionsRepository['findLiveMembership']>();
  const sessions = { findLiveMembership } satisfies Pick<SessionsRepository, 'findLiveMembership'>;
  // The cast only drops the repository methods the guard never calls.
  const guard = new AccessTokenGuard(
    new Reflector(),
    tokens,
    new AuthCookies(config),
    sessions as unknown as SessionsRepository,
  );

  function contextFor(handler: keyof FixtureController, fake?: FakeRequest): HttpContext {
    return createHttpContext(FixtureController, handler, fake);
  }

  async function contextWithToken(user: AuthUser): Promise<HttpContext> {
    const token = await tokens.sign(user, SESSION_ID);
    return contextFor('closed', { cookies: { [ACCESS_TOKEN_COOKIE]: token } });
  }

  beforeEach(() => {
    findLiveMembership.mockReset();
    findLiveMembership.mockResolvedValue({
      workspaceId: OWNER.workspaceId,
      role: OWNER.role,
      isDemo: false,
    });
  });

  it('should pass a public route when no cookie is sent', async () => {
    const { context } = contextFor('open');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should reject a protected route when no cookie is sent', async () => {
    const { context } = contextFor('closed');

    await expect(guard.canActivate(context)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should reject a protected route when the cookie is not a valid token', async () => {
    const { context } = contextFor('closed', {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'not-a-jwt' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should reject a valid token when no live session with a membership is found', async () => {
    findLiveMembership.mockResolvedValue(null);
    const { context } = await contextWithToken(OWNER);

    await expect(guard.canActivate(context)).rejects.toThrow(AuthenticationRequiredError);
  });

  it('should set the user from the membership when the token holds valid claims', async () => {
    const { context, request } = await contextWithToken(OWNER);

    await guard.canActivate(context);

    expect(findLiveMembership).toHaveBeenCalledWith({
      userId: OWNER.id,
      sessionId: SESSION_ID,
      now: expect.any(Date) as Date,
    });
    expect(getAuthUser(request)).toEqual(OWNER);
  });

  it('should take the role from the database when the claims say owner and it says manager', async () => {
    findLiveMembership.mockResolvedValue({
      workspaceId: OWNER.workspaceId,
      role: 'manager',
      isDemo: false,
    });
    const { context, request } = await contextWithToken(OWNER);

    await guard.canActivate(context);

    expect(getAuthUser(request)?.role).toBe('manager');
  });
});
