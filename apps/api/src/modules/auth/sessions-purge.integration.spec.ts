import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { registerAccount } from '../../../test/fixtures/accounts.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { flushValkey } from '../../../test/support/valkey.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RecurringJobs } from '../../infra/queue/recurring-jobs.js';

describe('expired sessions purge', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    testApp = await createTestApp({ shouldRunJobs: true });
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await flushValkey(inject('redisUrl'));
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should delete ended sessions with their tokens and keep live ones when the job runs', async () => {
    const account = await registerAccount(testApp);
    const userId = account.session.user.id;
    await prisma.session.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() - 1000),
        refreshTokens: { create: { tokenHash: randomBytes(32) } },
      },
    });

    await testApp.app.get(RecurringJobs).tick();

    await expect.poll(() => prisma.session.count(), { timeout: 10_000 }).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(1);
    await account.http.get('/api/auth/me').expect(200);
  });
});
