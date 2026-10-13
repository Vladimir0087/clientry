import type { MemberRole } from '@clientry/shared/auth';
import type { WorkspaceResponse } from '@clientry/shared/workspaces';

import { findCallerRole } from './caller-role.repository.js';
import type { LockedWorkspaceRepository } from './workspace.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';

export class PrismaLockedWorkspaceRepository implements LockedWorkspaceRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    return findCallerRole(this.tx, workspaceId, userId);
  }

  rename(workspaceId: string, name: string): Promise<WorkspaceResponse> {
    return this.tx.workspace.update({
      where: { id: workspaceId },
      data: { name },
      select: { id: true, name: true },
    });
  }
}
