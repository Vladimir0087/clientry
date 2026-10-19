import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { can, hasPermission } from '@clientry/shared/auth';
import type { Permission } from '@clientry/shared/auth';

import { AuthenticationRequiredError, DemoLockedError, InsufficientRoleError } from './errors.js';
import { getAuthUser } from '../../common/auth/auth-user.js';
import { PERMISSION_KEY } from '../../common/auth/require-permission.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission === undefined) {
      return true;
    }
    const user = getAuthUser(context.switchToHttp().getRequest<Request>());
    if (!user) {
      throw new AuthenticationRequiredError();
    }
    // The role first: a demo manager is refused for his role, as any manager is. Past it, can
    // refuses only for the demo lock.
    if (!hasPermission(user.role, permission)) {
      throw new InsufficientRoleError();
    }
    if (!can(user, permission)) {
      throw new DemoLockedError();
    }
    return true;
  }
}
