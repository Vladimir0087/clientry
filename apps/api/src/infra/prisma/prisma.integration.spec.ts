import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from './prisma.service.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';

interface StatementTimeout {
  readonly statement_timeout: string;
}

interface SessionTimeZone {
  readonly TimeZone: string;
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

  it('should open connections in UTC when the server defaults to another zone', async () => {
    const prisma = testApp.app.get(PrismaService);

    const [row] = await prisma.$queryRaw<SessionTimeZone[]>`SHOW TimeZone`;

    expect(row?.TimeZone).toBe('UTC');
  });
});
