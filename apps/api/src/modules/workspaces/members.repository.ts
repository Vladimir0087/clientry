import type { MemberRole } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

export interface MemberRef {
  readonly id: string;
  readonly name: string;
}

export interface MemberHandover {
  readonly actorId: string;
  readonly member: MemberRef;
  readonly receiver: MemberRef;
}

// Bound to a transaction that holds the workspace lock.
export interface LockedMembersRepository {
  findRole(workspaceId: string, userId: string): Promise<MemberRole | null>;
  findMember(workspaceId: string, userId: string): Promise<Member | null>;
  countOwners(workspaceId: string): Promise<number>;
  updateRole(workspaceId: string, userId: string, role: MemberRole): Promise<Member>;
  // Taken before the membership is deleted: task edits lock the task, then read the membership.
  lockOpenTasks(workspaceId: string, userId: string): Promise<void>;
  // Waits for deal and task writes that read the membership FOR SHARE.
  deleteMembership(workspaceId: string, userId: string): Promise<void>;
  // Each returns how many open records went to the receiver, deleted and hidden ones included.
  handOverDeals(workspaceId: string, handover: MemberHandover): Promise<number>;
  handOverTasks(workspaceId: string, handover: MemberHandover): Promise<number>;
  // Sessions belong to the user, not to a workspace; returns how many were not revoked yet.
  revokeSessions(userId: string, now: Date): Promise<number>;
  revokePendingInvitesCreatedBy(workspaceId: string, userId: string, now: Date): Promise<void>;
}

// Names the unit of work in the line logged when a write conflict runs it once more.
export type MembersOperation = 'members.updateRole' | 'members.remove';

export abstract class MembersRepository {
  // In join order: membership created_at, then id.
  abstract list(workspaceId: string): Promise<Member[]>;
  abstract inWorkspaceLock<T>(
    workspaceId: string,
    operation: MembersOperation,
    work: (members: LockedMembersRepository) => Promise<T>,
  ): Promise<T>;
}
