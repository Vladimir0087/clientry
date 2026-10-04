import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { MemberRole } from '@clientry/shared/auth';

import { AuthenticationRequiredError, InsufficientRoleError } from './errors.js';
import { getAuthUser } from '../../common/auth/auth-user.js';
import { ROLES_KEY } from '../../common/auth/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<readonly MemberRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined) {
      return true;
    }
    const user = getAuthUser(context.switchToHttp().getRequest<Request>());
    if (!user) {
      throw new AuthenticationRequiredError();
    }
    if (!roles.includes(user.role)) {
      throw new InsufficientRoleError();
    }
    return true;
  }
}
