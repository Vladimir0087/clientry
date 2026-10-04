import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { InsufficientRoleError } from './errors.js';
import { RolesGuard } from './roles.guard.js';
import { createHttpContext } from '../../../test/support/http-context.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { setAuthUser } from '../../common/auth/auth-user.js';
import { Roles } from '../../common/auth/roles.decorator.js';

const USER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'manager',
};

@Controller('fixture')
class FixtureController {
  @Get('closed')
  closed(): void {
    // route body is irrelevant to guards
  }

  @Get('owner')
  @Roles('owner')
  ownerOnly(): void {
    // route body is irrelevant to guards
  }
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('should pass any member when the route declares no roles', () => {
    const { context, request } = createHttpContext(FixtureController, 'closed');
    setAuthUser(request, USER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject a manager when the route is for owners only', () => {
    const { context, request } = createHttpContext(FixtureController, 'ownerOnly');
    setAuthUser(request, USER);

    expect(() => guard.canActivate(context)).toThrow(InsufficientRoleError);
  });

  it('should pass an owner when the route is for owners only', () => {
    const { context, request } = createHttpContext(FixtureController, 'ownerOnly');
    setAuthUser(request, { ...USER, role: 'owner' });

    expect(guard.canActivate(context)).toBe(true);
  });
});
