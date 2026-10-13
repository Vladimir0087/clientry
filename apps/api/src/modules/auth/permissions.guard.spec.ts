import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { hasPermission } from '@clientry/shared/auth';
import type * as SharedAuth from '@clientry/shared/auth';

import { InsufficientRoleError } from './errors.js';
import { PermissionsGuard } from './permissions.guard.js';
import { createHttpContext } from '../../../test/support/http-context.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { setAuthUser } from '../../common/auth/auth-user.js';
import { RequirePermission } from '../../common/auth/require-permission.decorator.js';

const MANAGER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'manager',
};

const OWNER: AuthUser = { ...MANAGER, role: 'owner' };

@Controller('fixture')
class OpenController {
  @Get('open')
  open(): void {
    // route body is irrelevant to guards
  }

  @Get('team')
  @RequirePermission('team.manage')
  manageTeam(): void {
    // route body is irrelevant to guards
  }
}

@Controller('restricted')
@RequirePermission('team.manage')
class RestrictedController {
  @Get('inherited')
  inherited(): void {
    // route body is irrelevant to guards
  }

  @Get('stages')
  @RequirePermission('stages.manage')
  manageStages(): void {
    // route body is irrelevant to guards
  }
}

vi.mock('@clientry/shared/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedAuth>();
  return { ...actual, hasPermission: vi.fn(actual.hasPermission) };
});

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('should pass any member when the route requires no permission', () => {
    const { context, request } = createHttpContext(OpenController, 'open');
    setAuthUser(request, MANAGER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should pass an owner when the route requires team.manage', () => {
    const { context, request } = createHttpContext(OpenController, 'manageTeam');
    setAuthUser(request, OWNER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject a manager with InsufficientRoleError when the route requires team.manage', () => {
    const { context, request } = createHttpContext(OpenController, 'manageTeam');
    setAuthUser(request, MANAGER);

    expect(() => guard.canActivate(context)).toThrow(InsufficientRoleError);
  });

  it('should reject a manager when the permission comes from the controller', () => {
    const { context, request } = createHttpContext(RestrictedController, 'inherited');
    setAuthUser(request, MANAGER);

    expect(() => guard.canActivate(context)).toThrow(InsufficientRoleError);
  });

  it('should check the handler permission when the controller sets another one', () => {
    const { context, request } = createHttpContext(RestrictedController, 'manageStages');
    setAuthUser(request, OWNER);

    guard.canActivate(context);

    expect(vi.mocked(hasPermission)).toHaveBeenLastCalledWith('owner', 'stages.manage');
  });
});
