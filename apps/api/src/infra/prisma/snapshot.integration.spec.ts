import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from './prisma.service.js';
import { inSnapshot } from './snapshot.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';

describe('inSnapshot', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should run the work at repeatable read when a snapshot is opened', async () => {
    const [row] = await inSnapshot(
      prisma,
      (tx) =>
        tx.$queryRaw<{ level: string }[]>`SELECT current_setting('transaction_isolation') AS level`,
    );

    expect(row?.level).toBe('repeatable read');
  });
});
