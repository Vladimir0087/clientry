import type { SessionResponse } from '@clientry/shared/auth';

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

// The one place not scoped by workspaceId: login finds a user before any workspace is known.
export abstract class AccountsRepository {
  // Throws EmailTakenError when the email is already registered.
  abstract createOwnerAccount(input: NewOwnerAccount): Promise<Account>;
  abstract findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  // Null when the user or their membership no longer exists.
  abstract findAccount(userId: string): Promise<Account | null>;
}
