import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AccessTokenService } from './access-token.service.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthenticationRequiredError } from './errors.js';
import { SessionsRepository } from './sessions.repository.js';
import { setAuthUser } from '../../common/auth/auth-user.js';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator.js';

// Deny by default: a route without @Public() needs a valid access cookie.
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly cookies: AuthCookies,
    private readonly sessions: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.cookies.readAccessToken(request);
    if (token === undefined) {
      throw new AuthenticationRequiredError();
    }
    const { sub, sid } = await this.tokens.verify(token);
    // Session state, workspace and role come from the database, so logout, reuse detection, removal
    // and role changes apply at once; wid and role in the token are for the web middleware only.
    const membership = await this.sessions.findLiveMembership({
      userId: sub,
      sessionId: sid,
      now: new Date(),
    });
    if (!membership) {
      throw new AuthenticationRequiredError();
    }
    setAuthUser(request, { id: sub, ...membership });
    return true;
  }
}
