import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { hasPermission } from '@clientry/shared/auth';
import type { Permission } from '@clientry/shared/auth';

import { AuthenticationRequiredError, InsufficientRoleError } from './errors.js';
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
    if (!hasPermission(user.role, permission)) {
      throw new InsufficientRoleError();
    }
    return true;
  }
}
