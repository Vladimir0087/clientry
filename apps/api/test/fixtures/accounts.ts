import { randomUUID } from 'node:crypto';

import { agent } from 'supertest';
import type { Agent, Response } from 'supertest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';
import { INVITE_LIMITS } from '@clientry/shared/workspaces';

import { generateOpaqueToken, hashOpaqueToken } from '../../src/common/crypto/opaque-token.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';
import { setCookieValue } from '../support/set-cookies.js';

export const TEST_PASSWORD = 'correct horse battery staple';

export interface TestAccount {
  // Keeps the cookies the API sets, like a browser would.
  readonly http: Agent;
  readonly email: string;
  readonly session: SessionResponse;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@studio.dev`;
}

function toTestAccount(http: Agent, email: string, response: Response): TestAccount {
  return {
    http,
    email,
    session: sessionResponseSchema.parse(response.body),
    accessToken: setCookieValue(response, ACCESS_TOKEN_COOKIE),
    refreshToken: setCookieValue(response, REFRESH_TOKEN_COOKIE),
  };
}

export async function registerAccount(
  testApp: TestApp,
  workspaceName = 'Pixel Studio',
): Promise<TestAccount> {
  const http = agent(testApp.app.getHttpServer());
  const email = uniqueEmail('owner');
  const response = await http
    .post('/api/auth/register')
    .send({ email, password: TEST_PASSWORD, name: 'Ann', workspaceName })
    .expect(201);
  return toTestAccount(http, email, response);
}

// Callers pass only the workspace id, so the invite is inserted directly; the join uses the API.
export async function addManager(testApp: TestApp, workspaceId: string): Promise<TestAccount> {
  const prisma = testApp.app.get(PrismaService);
  const owner = await prisma.membership.findFirstOrThrow({
    where: { workspaceId, role: 'owner' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userId: true },
  });
  const token = generateOpaqueToken();
  await prisma.invite.create({
    data: {
      workspaceId,
      createdById: owner.userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + INVITE_LIMITS.lifetimeMs),
    },
  });
  const http = agent(testApp.app.getHttpServer());
  const email = uniqueEmail('manager');
  const response = await http
    .post('/api/auth/invite/register')
    .send({ token, email, password: TEST_PASSWORD, name: 'Max' })
    .expect(201);
  return toTestAccount(http, email, response);
}

// The user's only session right after registration.
export async function findSessionId(testApp: TestApp, userId: string): Promise<string> {
  const { id } = await testApp.app
    .get(PrismaService)
    .session.findFirstOrThrow({ where: { userId }, select: { id: true } });
  return id;
}
