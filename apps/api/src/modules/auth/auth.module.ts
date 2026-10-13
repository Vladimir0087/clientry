import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Queue } from 'bullmq';

import { AccessTokenGuard } from './access-token.guard.js';
import { AccessTokenService } from './access-token.service.js';
import { AccountsRepository } from './accounts.repository.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PrismaAccountsRepository } from './prisma-accounts.repository.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';
import { SessionRevocation } from './session-revocation.repository.js';
import {
  SESSIONS_QUEUE,
  SESSIONS_QUEUE_TOKEN,
  SessionsPurgeWorker,
} from './sessions-purge.worker.js';
import { SessionsRepository } from './sessions.repository.js';
import { noStore } from '../../common/http/no-store.middleware.js';
import { TOO_MANY_REQUESTS_DETAIL } from '../../common/http/problem-details.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { QueueFactory } from '../../infra/queue/queue-factory.js';

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
    PermissionsGuard,
    SessionRevocation,
    SessionsPurgeWorker,
    {
      provide: SESSIONS_QUEUE_TOKEN,
      useFactory: (queues: QueueFactory): Queue => queues.createQueue(SESSIONS_QUEUE),
      inject: [QueueFactory],
    },
    { provide: AccountsRepository, useClass: PrismaAccountsRepository },
    { provide: SessionsRepository, useClass: PrismaSessionsRepository },
  ],
  exports: [AccessTokenGuard, PermissionsGuard, SessionRevocation],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(noStore).forRoutes(AuthController);
  }
}
