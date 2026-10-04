import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';

import { AccessTokenGuard } from './access-token.guard.js';
import { AccessTokenService } from './access-token.service.js';
import { AccountsRepository } from './accounts.repository.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { PrismaAccountsRepository } from './prisma-accounts.repository.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';
import { RolesGuard } from './roles.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { TOO_MANY_REQUESTS_DETAIL } from '../../common/http/problem-details.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

// Middleware runs before guards, so rejected and throttled answers are not stored either.
function noStore(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

@Module({
  imports: [
    PrismaModule,
    // Every limited route sets its own limit with @Throttle; this entry only names the throttler.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }],
      errorMessage: TOO_MANY_REQUESTS_DETAIL,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookies,
    AccessTokenService,
    PasswordHasher,
    AccessTokenGuard,
    RolesGuard,
    { provide: AccountsRepository, useClass: PrismaAccountsRepository },
    { provide: SessionsRepository, useClass: PrismaSessionsRepository },
  ],
  exports: [AccessTokenGuard, RolesGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(noStore).forRoutes(AuthController);
  }
}
