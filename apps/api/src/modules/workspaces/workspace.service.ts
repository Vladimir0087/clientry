import { Injectable, Logger } from '@nestjs/common';

import type { RenameWorkspaceRequest, WorkspaceResponse } from '@clientry/shared/workspaces';

import { assertCallerPermission } from './caller-permission.js';
import { WorkspaceRepository } from './workspace.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(private readonly workspace: WorkspaceRepository) {}

  async rename(user: AuthUser, { name }: RenameWorkspaceRequest): Promise<WorkspaceResponse> {
    const { workspaceId } = user;
    const renamed = await this.workspace.inWorkspaceLock(workspaceId, async (locked) => {
      assertCallerPermission(await locked.findRole(workspaceId, user.id), 'workspace.manage');
      return locked.rename(workspaceId, name);
    });
    this.logger.log({ workspaceId, userId: user.id }, 'Workspace renamed');
    return renamed;
  }
}
