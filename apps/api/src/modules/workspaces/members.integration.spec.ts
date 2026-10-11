import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { memberListResponseSchema } from '@clientry/shared/workspaces';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

describe('members API', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.app.get(PrismaService));
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should list the members of the own workspace in join order when a manager asks', async () => {
    const owner = await registerAccount(testApp, 'Pixel Studio');
    const stranger = await registerAccount(testApp, 'Other Studio');
    const first = await addManager(testApp, owner.session.workspace.id);
    const second = await addManager(testApp, owner.session.workspace.id);
    await addManager(testApp, stranger.session.workspace.id);

    const response = await first.http.get('/api/members');

    expect(response.status).toBe(200);
    const { items } = memberListResponseSchema.parse(response.body);
    expect(items.map(({ id }) => id)).toEqual([
      owner.session.user.id,
      first.session.user.id,
      second.session.user.id,
    ]);
    expect(items[0]).toMatchObject({ name: 'Ann', email: owner.email, role: 'owner' });
    expect(items[1]).toMatchObject({ name: 'Max', role: 'manager' });
  });
});
