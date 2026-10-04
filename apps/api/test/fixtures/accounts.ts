import { randomUUID } from 'node:crypto';

import { agent } from 'supertest';
import type { Agent, Response } from 'supertest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
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

// Inserted directly until invites exist; the login still goes through the API.
export async function addManager(testApp: TestApp, workspaceId: string): Promise<TestAccount> {
  const passwordHash = await testApp.app.get(PasswordHasher).hash(TEST_PASSWORD);
  const email = uniqueEmail('manager');
  await testApp.app.get(PrismaService).user.create({
    data: {
      email,
      passwordHash,
      name: 'Max',
      membership: { create: { workspaceId, role: 'manager' } },
    },
  });
  const http = agent(testApp.app.getHttpServer());
  const response = await http
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return toTestAccount(http, email, response);
}

// The user's only session right after registration.
export async function findSessionId(testApp: TestApp, userId: string): Promise<string> {
  const { id } = await testApp.app
    .get(PrismaService)
    .session.findFirstOrThrow({ where: { userId }, select: { id: true } });
  return id;
}
