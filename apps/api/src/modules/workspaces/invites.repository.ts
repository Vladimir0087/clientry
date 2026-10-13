import type { MemberRole } from '@clientry/shared/auth';
import type { InviteSummary } from '@clientry/shared/workspaces';

export interface NewInvite {
  readonly createdById: string;
  readonly tokenHash: Uint8Array<ArrayBuffer>;
  readonly expiresAt: Date;
}

// Pending: not used, not revoked and not expired at the given moment.
// Bound to a transaction that holds the workspace lock.
export interface LockedInvitesRepository {
  findRole(workspaceId: string, userId: string): Promise<MemberRole | null>;
  countPending(workspaceId: string, now: Date): Promise<number>;
  create(workspaceId: string, invite: NewInvite): Promise<InviteSummary>;
  // False when no pending invite of the workspace has the id.
  revoke(workspaceId: string, id: string, now: Date): Promise<boolean>;
}

export abstract class InvitesRepository {
  // Pending invites, newest first.
  abstract listPending(workspaceId: string, now: Date): Promise<InviteSummary[]>;
  abstract inWorkspaceLock<T>(
    workspaceId: string,
    work: (invites: LockedInvitesRepository) => Promise<T>,
  ): Promise<T>;
}
