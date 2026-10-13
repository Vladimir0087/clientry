import type { MemberRole } from '@clientry/shared/auth';

export interface Membership {
  readonly workspaceId: string;
  readonly role: MemberRole;
}

export interface StoredRefreshToken {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly rotatedAt: Date | null;
  readonly sessionExpiresAt: Date;
  readonly sessionRevokedAt: Date | null;
}

export interface NewSession {
  readonly userId: string;
  readonly expiresAt: Date;
  readonly tokenHash: Uint8Array<ArrayBuffer>;
}

export interface TokenRotation {
  readonly tokenId: string;
  readonly sessionId: string;
  readonly rotatedAt: Date;
  readonly successorHash: Uint8Array<ArrayBuffer>;
}

export interface LiveSessionLookup {
  readonly userId: string;
  readonly sessionId: string;
  readonly now: Date;
}

export abstract class SessionsRepository {
  // Returns the new session's id, or null when the user is no longer a member.
  abstract createSession(session: NewSession): Promise<string | null>;
  // Null unless the session belongs to the user, is not revoked, has not ended, and the user is
  // still a member.
  abstract findLiveMembership(lookup: LiveSessionLookup): Promise<Membership | null>;
  // Deletes sessions that ended at or before the moment, with their tokens.
  abstract deleteEndedSessions(userId: string, now: Date): Promise<void>;
  abstract findToken(tokenHash: Uint8Array<ArrayBuffer>): Promise<StoredRefreshToken | null>;
  // Marks the token rotated unless it already is, and adds its successor to the same session.
  abstract rotate(rotation: TokenRotation): Promise<void>;
  abstract revokeSession(sessionId: string, now: Date): Promise<void>;
  // Deletes up to limit sessions of any user that ended at or before the moment, with their tokens;
  // returns how many went.
  abstract deleteExpired(now: Date, limit: number): Promise<number>;
}
