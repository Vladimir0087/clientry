import type { MemberRole } from '@clientry/shared/auth';
import type { WorkspaceResponse } from '@clientry/shared/workspaces';

// Bound to a transaction that holds the workspace lock.
export interface LockedWorkspaceRepository {
  findRole(workspaceId: string, userId: string): Promise<MemberRole | null>;
  rename(workspaceId: string, name: string): Promise<WorkspaceResponse>;
}

export abstract class WorkspaceRepository {
  abstract inWorkspaceLock<T>(
    workspaceId: string,
    work: (workspace: LockedWorkspaceRepository) => Promise<T>,
  ): Promise<T>;
}
