import { agent } from 'supertest';

import { sessionResponseSchema } from '@clientry/shared/auth';
import type { MemberRole } from '@clientry/shared/auth';

import { DemoResetService } from '../../src/modules/demo/demo-reset.service.js';
import type { TestApp } from '../create-test-app.js';
import { toTestAccount } from './accounts.js';
import type { TestAccount } from './accounts.js';
import { TRUSTED_ORIGIN } from '../support/test-env.js';

export async function resetDemo(testApp: TestApp, now = new Date()): Promise<void> {
  await testApp.app.get(DemoResetService).reset(now);
}

// Through the demo button's route, so the agent keeps the cookies as a visitor's browser would.
export async function enterDemo(
  testApp: TestApp,
  role: MemberRole = 'owner',
): Promise<TestAccount> {
  const http = agent(testApp.app.getHttpServer());
  const response = await http
    .post('/api/auth/demo')
    .set('Origin', TRUSTED_ORIGIN)
    .send({ role })
    .expect(200);
  const { user } = sessionResponseSchema.parse(response.body);
  return toTestAccount(http, user.email, response);
}
