import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { getAuthUser } from './auth-user.js';
import type { AuthUser } from './auth-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = getAuthUser(request);
    // Only a @Public() handler can get here without a user, and it has no user to ask for.
    if (!user) {
      throw new Error('@CurrentUser() used on a route that is not authenticated');
    }
    return user;
  },
);
