import type { InvitePreviewResponse, SessionResponse } from '@clientry/shared/auth';

import type { DefaultStage } from './default-stages.js';

export type Account = SessionResponse;

export interface AccountCredentials {
  readonly userId: string;
  readonly passwordHash: string;
  // Null when the user has no membership.
  readonly account: Account | null;
}

export interface NewOwnerAccount {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly workspaceName: string;
  readonly stages: readonly DefaultStage[];
}

export interface NewInvitedAccount {
  readonly tokenHash: Uint8Array<ArrayBuffer>;
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly now: Date;
}

export interface InviteJoin {
  readonly tokenHash: Uint8Array<ArrayBuffer>;
  readonly userId: string;
  readonly now: Date;
}

export interface JoinedAccount {
  readonly account: Account;
  readonly inviteId: string;
}

// Not scoped by workspaceId: login finds a user before any workspace is known, and a join takes
// the workspace from the invite it claims.
export abstract class AccountsRepository {
  // Throws EmailTakenError when the email is already registered.
  abstract createOwnerAccount(input: NewOwnerAccount): Promise<Account>;
  abstract findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  // Null when the user or their membership no longer exists.
  abstract findAccount(userId: string): Promise<Account | null>;
  // Null unless a pending invite has the hash.
  abstract findInvitePreview(
    tokenHash: Uint8Array<ArrayBuffer>,
    now: Date,
  ): Promise<InvitePreviewResponse | null>;
  // One transaction: claims the invite, creates a manager. Throws InviteInvalidError, or
  // EmailTakenError after which the invite stays usable.
  abstract createInvitedAccount(input: NewInvitedAccount): Promise<JoinedAccount>;
  // One transaction: claims the invite, makes the user a manager. Throws InviteInvalidError, or
  // AlreadyInWorkspaceError after which the invite stays usable.
  abstract joinByInvite(join: InviteJoin): Promise<JoinedAccount>;
}
