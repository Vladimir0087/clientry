import { createdInviteResponseSchema } from '@clientry/shared/workspaces';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';
import type { TestAccount } from './accounts.js';

export interface CreatedInvite {
  readonly id: string;
  readonly token: string;
}

export async function createInvite(owner: TestAccount): Promise<CreatedInvite> {
  const response = await owner.http.post('/api/invites').expect(201);
  const { id, token } = createdInviteResponseSchema.parse(response.body);
  return { id, token };
}

export async function expireInvite(testApp: TestApp, id: string): Promise<void> {
  await testApp.app.get(PrismaService).invite.update({
    where: { id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}

export async function markInviteUsed(testApp: TestApp, id: string): Promise<void> {
  await testApp.app.get(PrismaService).invite.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}
