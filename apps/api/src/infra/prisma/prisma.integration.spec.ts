import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from './prisma.service.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';

interface StatementTimeout {
  readonly statement_timeout: string;
}

describe('PrismaService', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should open connections with the statement timeout when the app queries Postgres', async () => {
    const prisma = testApp.app.get(PrismaService);

    const [row] = await prisma.$queryRaw<StatementTimeout[]>`SHOW statement_timeout`;

    expect(row?.statement_timeout).toBe('10s');
  });
});
