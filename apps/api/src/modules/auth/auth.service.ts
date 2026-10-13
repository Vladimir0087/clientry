import { Injectable, Logger } from '@nestjs/common';

import type {
  InviteLoginRequest,
  InvitePreviewResponse,
  InviteRegisterRequest,
  LoginRequest,
  RegisterRequest,
  SessionResponse,
} from '@clientry/shared/auth';

import { AccessTokenService } from './access-token.service.js';
import { AccountsRepository } from './accounts.repository.js';
import type { Account, AccountCredentials, JoinedAccount } from './accounts.repository.js';
import { DEFAULT_STAGES } from './default-stages.js';
import {
  AlreadyInWorkspaceError,
  AuthenticationRequiredError,
  InvalidCredentialsError,
  InviteInvalidError,
  InvalidRefreshTokenError,
  NoWorkspaceError,
} from './errors.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsRepository } from './sessions.repository.js';
import type { StoredRefreshToken } from './sessions.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/crypto/opaque-token.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SESSION_LIFETIME_MS = 30 * DAY_MS;
export const REFRESH_IDLE_LIMIT_MS = 14 * DAY_MS;
export const ROTATION_GRACE_MS = 30 * 1000;

export interface IssuedSession {
  readonly session: SessionResponse;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshMaxAgeMs: number;
}

interface SessionRef {
  readonly id: string;
  readonly expiresAt: Date;
}

function elapsedMs(since: Date, now: Date): number {
  return now.getTime() - since.getTime();
}

// Every refresh issues a new token, so the age of the presented one is the session's idle time.
function isTokenUsable(token: StoredRefreshToken, now: Date): boolean {
  return (
    token.sessionRevokedAt === null &&
    token.sessionExpiresAt > now &&
    elapsedMs(token.createdAt, now) < REFRESH_IDLE_LIMIT_MS
  );
}

function toAuthUser(account: Account): AuthUser {
  return { id: account.user.id, workspaceId: account.workspace.id, role: account.role };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly accounts: AccountsRepository,
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AccessTokenService,
  ) {}

  async register(input: RegisterRequest): Promise<IssuedSession> {
    // Hashed before the transaction, so argon2 never holds a database connection.
    const passwordHash = await this.hasher.hash(input.password);
    const account = await this.accounts.createOwnerAccount({
      email: input.email,
      passwordHash,
      name: input.name,
      workspaceName: input.workspaceName,
      stages: DEFAULT_STAGES,
    });
    this.logger.log(
      { userId: account.user.id, workspaceId: account.workspace.id },
      'Account registered',
    );
    return this.startSession(account, new Date());
  }

  async login(input: LoginRequest): Promise<IssuedSession> {
    const credentials = await this.verifyCredentials(input);
    if (!credentials.account) {
      throw new NoWorkspaceError();
    }
    const now = new Date();
    await this.sessions.deleteEndedSessions(credentials.userId, now);
    this.logger.log({ userId: credentials.userId }, 'Logged in');
    return this.startSession(credentials.account, now);
  }

  async previewInvite(token: string): Promise<InvitePreviewResponse> {
    const preview = await this.accounts.findInvitePreview(hashOpaqueToken(token), new Date());
    if (!preview) {
      throw new InviteInvalidError();
    }
    return preview;
  }

  // presentedRefreshToken is the browser's previous session, signed out once the join succeeds.
  async registerByInvite(
    input: InviteRegisterRequest,
    presentedRefreshToken: string | undefined,
  ): Promise<IssuedSession> {
    const passwordHash = await this.hasher.hash(input.password);
    const now = new Date();
    const joined = await this.accounts.createInvitedAccount({
      tokenHash: hashOpaqueToken(input.token),
      email: input.email,
      passwordHash,
      name: input.name,
      now,
    });
    return this.enterJoinedWorkspace(joined, 'register', presentedRefreshToken, now);
  }

  async loginByInvite(
    input: InviteLoginRequest,
    presentedRefreshToken: string | undefined,
  ): Promise<IssuedSession> {
    // A dead link answers before any password check, so this is no second endpoint for guessing.
    await this.previewInvite(input.token);
    const credentials = await this.verifyCredentials(input);
    if (credentials.account) {
      throw new AlreadyInWorkspaceError();
    }
    const now = new Date();
    // Before the claim: a failure after it would leave the account joined and the link dead.
    await this.sessions.deleteEndedSessions(credentials.userId, now);
    const joined = await this.accounts.joinByInvite({
      tokenHash: hashOpaqueToken(input.token),
      userId: credentials.userId,
      now,
    });
    return this.enterJoinedWorkspace(joined, 'login', presentedRefreshToken, now);
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const now = new Date();
    const stored = await this.findUsableToken(refreshToken, now);
    if (stored.rotatedAt && elapsedMs(stored.rotatedAt, now) >= ROTATION_GRACE_MS) {
      return this.rejectReuse(stored, now);
    }
    const account = await this.accounts.findAccount(stored.userId);
    if (!account) {
      await this.sessions.revokeSession(stored.sessionId, now);
      throw new InvalidRefreshTokenError();
    }
    // Inside the grace period the token is exchanged again: two tabs or a retried request.
    const successor = generateOpaqueToken();
    await this.sessions.rotate({
      tokenId: stored.id,
      sessionId: stored.sessionId,
      rotatedAt: now,
      successorHash: hashOpaqueToken(successor),
    });
    return this.issue(
      account,
      successor,
      { id: stored.sessionId, expiresAt: stored.sessionExpiresAt },
      now,
    );
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined) {
      return;
    }
    const stored = await this.sessions.findToken(hashOpaqueToken(refreshToken));
    if (stored) {
      await this.sessions.revokeSession(stored.sessionId, new Date());
    }
  }

  async getSession(user: AuthUser): Promise<SessionResponse> {
    const account = await this.accounts.findAccount(user.id);
    if (!account) {
      throw new AuthenticationRequiredError();
    }
    return account;
  }

  private async verifyCredentials(input: LoginRequest): Promise<AccountCredentials> {
    const credentials = await this.accounts.findCredentialsByEmail(input.email);
    if (!credentials) {
      await this.hasher.verifyDummy(input.password);
      this.logger.log({ reason: 'unknown_email' }, 'Login failed');
      throw new InvalidCredentialsError();
    }
    const isValid = await this.hasher.verify(credentials.passwordHash, input.password);
    if (!isValid) {
      this.logger.log({ reason: 'wrong_password', userId: credentials.userId }, 'Login failed');
      throw new InvalidCredentialsError();
    }
    return credentials;
  }

  private async enterJoinedWorkspace(
    { account, inviteId }: JoinedAccount,
    mode: 'register' | 'login',
    presentedRefreshToken: string | undefined,
    now: Date,
  ): Promise<IssuedSession> {
    this.logger.log(
      { inviteId, mode, userId: account.user.id, workspaceId: account.workspace.id },
      'Invite accepted',
    );
    // After the new session: a join refused at the session start leaves the browser signed in.
    const session = await this.startSession(account, now);
    await this.logout(presentedRefreshToken);
    return session;
  }

  private async findUsableToken(
    refreshToken: string | undefined,
    now: Date,
  ): Promise<StoredRefreshToken> {
    if (refreshToken === undefined) {
      throw new InvalidRefreshTokenError();
    }
    const stored = await this.sessions.findToken(hashOpaqueToken(refreshToken));
    if (!stored || !isTokenUsable(stored, now)) {
      throw new InvalidRefreshTokenError();
    }
    return stored;
  }

  private async rejectReuse(stored: StoredRefreshToken, now: Date): Promise<never> {
    await this.sessions.revokeSession(stored.sessionId, now);
    this.logger.warn(
      { userId: stored.userId, sessionId: stored.sessionId },
      'Refresh token reused, session revoked',
    );
    throw new InvalidRefreshTokenError();
  }

  private async startSession(account: Account, now: Date): Promise<IssuedSession> {
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    const sessionId = await this.sessions.createSession({
      userId: account.user.id,
      expiresAt,
      tokenHash: hashOpaqueToken(refreshToken),
    });
    // The member was removed after the account was read.
    if (sessionId === null) {
      throw new NoWorkspaceError();
    }
    return this.issue(account, refreshToken, { id: sessionId, expiresAt }, now);
  }

  private async issue(
    account: Account,
    refreshToken: string,
    session: SessionRef,
    now: Date,
  ): Promise<IssuedSession> {
    const accessToken = await this.tokens.sign(toAuthUser(account), session.id);
    const refreshMaxAgeMs = Math.min(
      REFRESH_IDLE_LIMIT_MS,
      session.expiresAt.getTime() - now.getTime(),
    );
    return { session: account, accessToken, refreshToken, refreshMaxAgeMs };
  }
}
