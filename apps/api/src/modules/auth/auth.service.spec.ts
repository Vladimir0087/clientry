import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { AccessTokenService } from './access-token.service.js';
import type { Account, AccountsRepository } from './accounts.repository.js';
import {
  REFRESH_IDLE_LIMIT_MS,
  ROTATION_GRACE_MS,
  SESSION_LIFETIME_MS,
  AuthService,
} from './auth.service.js';
import {
  EmailTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  NoWorkspaceError,
} from './errors.js';
import type { PasswordHasher } from './password-hasher.js';
import type { SessionsRepository, StoredRefreshToken } from './sessions.repository.js';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const PASSWORD = 'correct horse battery';

const ACCOUNT: Account = {
  user: { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', email: 'ann@studio.dev', name: 'Ann' },
  workspace: { id: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e', name: 'Pixel Studio' },
  role: 'owner',
};

const REGISTRATION = {
  email: ACCOUNT.user.email,
  password: PASSWORD,
  name: ACCOUNT.user.name,
  workspaceName: ACCOUNT.workspace.name,
};

function msBefore(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function storedToken(overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken {
  return {
    id: 'token-1',
    sessionId: 'session-1',
    userId: ACCOUNT.user.id,
    createdAt: msBefore(60_000),
    rotatedAt: null,
    sessionExpiresAt: new Date(NOW.getTime() + SESSION_LIFETIME_MS / 2),
    sessionRevokedAt: null,
    ...overrides,
  };
}

function createAccountsMock() {
  return {
    createOwnerAccount: vi
      .fn<AccountsRepository['createOwnerAccount']>()
      .mockResolvedValue(ACCOUNT),
    findCredentialsByEmail: vi
      .fn<AccountsRepository['findCredentialsByEmail']>()
      .mockResolvedValue({
        userId: ACCOUNT.user.id,
        passwordHash: 'stored-hash',
        account: ACCOUNT,
      }),
    findAccount: vi.fn<AccountsRepository['findAccount']>().mockResolvedValue(ACCOUNT),
  } satisfies AccountsRepository;
}

function createSessionsMock() {
  return {
    createSession: vi.fn<SessionsRepository['createSession']>().mockResolvedValue('session-new'),
    findLiveMembership: vi.fn<SessionsRepository['findLiveMembership']>().mockResolvedValue(null),
    deleteEndedSessions: vi
      .fn<SessionsRepository['deleteEndedSessions']>()
      .mockResolvedValue(undefined),
    findToken: vi.fn<SessionsRepository['findToken']>().mockResolvedValue(storedToken()),
    rotate: vi.fn<SessionsRepository['rotate']>().mockResolvedValue(undefined),
    revokeSession: vi.fn<SessionsRepository['revokeSession']>().mockResolvedValue(undefined),
    deleteExpired: vi.fn<SessionsRepository['deleteExpired']>().mockResolvedValue(0),
  } satisfies SessionsRepository;
}

function createHasherMock() {
  return {
    hash: vi.fn<PasswordHasher['hash']>().mockResolvedValue('new-hash'),
    verify: vi.fn<PasswordHasher['verify']>().mockResolvedValue(true),
    verifyDummy: vi.fn<PasswordHasher['verifyDummy']>().mockResolvedValue(undefined),
  } satisfies Pick<PasswordHasher, 'hash' | 'verify' | 'verifyDummy'>;
}

function createTokensMock() {
  return {
    sign: vi.fn<AccessTokenService['sign']>().mockResolvedValue('access-jwt'),
  } satisfies Pick<AccessTokenService, 'sign'>;
}

describe('AuthService', () => {
  let accounts: ReturnType<typeof createAccountsMock>;
  let sessions: ReturnType<typeof createSessionsMock>;
  let tokens: ReturnType<typeof createTokensMock>;
  let hasher: ReturnType<typeof createHasherMock>;
  let warn: MockInstance<Logger['warn']>;
  let service: AuthService;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    accounts = createAccountsMock();
    sessions = createSessionsMock();
    hasher = createHasherMock();
    tokens = createTokensMock();
    // satisfies keeps the mocks in step with the real classes; the casts only drop private fields.
    service = new AuthService(
      accounts,
      sessions,
      hasher as unknown as PasswordHasher,
      tokens as unknown as AccessTokenService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should hash the password before creating the account when registering', async () => {
      await service.register(REGISTRATION);

      expect(hasher.hash).toHaveBeenCalledWith(PASSWORD);
      expect(accounts.createOwnerAccount).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'new-hash' }),
      );
      expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
        accounts.createOwnerAccount.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('should propagate EmailTakenError when the email is registered', async () => {
      accounts.createOwnerAccount.mockRejectedValue(new EmailTakenError());

      await expect(service.register(REGISTRATION)).rejects.toThrow(EmailTakenError);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should check the dummy hash and throw when the email is unknown', async () => {
      accounts.findCredentialsByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'x@y.dev', password: PASSWORD })).rejects.toThrow(
        InvalidCredentialsError,
      );
      expect(hasher.verifyDummy).toHaveBeenCalledWith(PASSWORD);
    });

    it('should throw InvalidCredentialsError when the password is wrong', async () => {
      hasher.verify.mockResolvedValue(false);

      await expect(service.login({ email: ACCOUNT.user.email, password: 'wrong' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it('should throw NoWorkspaceError when the user has no membership', async () => {
      accounts.findCredentialsByEmail.mockResolvedValue({
        userId: ACCOUNT.user.id,
        passwordHash: 'stored-hash',
        account: null,
      });

      await expect(
        service.login({ email: ACCOUNT.user.email, password: PASSWORD }),
      ).rejects.toThrow(NoWorkspaceError);
    });

    it('should create a session ending in 30 days when the credentials are valid', async () => {
      await service.login({ email: ACCOUNT.user.email, password: PASSWORD });

      expect(sessions.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACCOUNT.user.id,
          expiresAt: new Date(NOW.getTime() + SESSION_LIFETIME_MS),
        }),
      );
    });

    it('should delete the user’s ended sessions when the credentials are valid', async () => {
      await service.login({ email: ACCOUNT.user.email, password: PASSWORD });

      expect(sessions.deleteEndedSessions).toHaveBeenCalledWith(ACCOUNT.user.id, NOW);
    });

    it('should sign the access token with the new session id when credentials are valid', async () => {
      await service.login({ email: ACCOUNT.user.email, password: PASSWORD });

      expect(tokens.sign).toHaveBeenCalledWith(
        { id: ACCOUNT.user.id, workspaceId: ACCOUNT.workspace.id, role: 'owner' },
        'session-new',
      );
    });
  });

  describe('refresh', () => {
    it.each([
      ['the hash is unknown', null],
      ['the session is revoked', storedToken({ sessionRevokedAt: msBefore(1000) })],
      ['the session has ended', storedToken({ sessionExpiresAt: NOW })],
      [
        'the token was issued 14 days ago',
        storedToken({ createdAt: msBefore(REFRESH_IDLE_LIMIT_MS) }),
      ],
    ])('should throw InvalidRefreshTokenError when %s', async (_case, stored) => {
      sessions.findToken.mockResolvedValue(stored);

      await expect(service.refresh('token')).rejects.toThrow(InvalidRefreshTokenError);
      expect(sessions.rotate).not.toHaveBeenCalled();
    });

    it('should throw InvalidRefreshTokenError when no token is sent', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('should accept the token and keep its session id when it was issued 14 days minus 1 ms ago', async () => {
      sessions.findToken.mockResolvedValue(
        storedToken({ createdAt: msBefore(REFRESH_IDLE_LIMIT_MS - 1) }),
      );

      await expect(service.refresh('token')).resolves.toMatchObject({ session: ACCOUNT });
    });

    it('should give the new refresh cookie 14 days when the session ends later', async () => {
      const issued = await service.refresh('token');

      expect(issued.refreshMaxAgeMs).toBe(REFRESH_IDLE_LIMIT_MS);
    });

    it('should cap the new refresh cookie at the session end when it comes sooner', async () => {
      sessions.findToken.mockResolvedValue(
        storedToken({ sessionExpiresAt: new Date(NOW.getTime() + 5000) }),
      );

      const issued = await service.refresh('token');

      expect(issued.refreshMaxAgeMs).toBe(5000);
    });

    it('should sign the new access token with the same session id when the token is fresh', async () => {
      await service.refresh('token');

      expect(tokens.sign).toHaveBeenCalledWith(expect.any(Object), 'session-1');
    });

    it('should mark the token rotated and issue a successor when the token is fresh', async () => {
      const issued = await service.refresh('token');

      expect(sessions.rotate).toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 'token-1', sessionId: 'session-1', rotatedAt: NOW }),
      );
      expect(issued.refreshToken).not.toBe('token');
      expect(issued.accessToken).toBe('access-jwt');
    });

    it('should issue a successor without revoking when rotated 30 s minus 1 ms ago', async () => {
      sessions.findToken.mockResolvedValue(
        storedToken({ rotatedAt: msBefore(ROTATION_GRACE_MS - 1) }),
      );

      await service.refresh('token');

      expect(sessions.rotate).toHaveBeenCalled();
      expect(sessions.revokeSession).not.toHaveBeenCalled();
    });

    it('should revoke the session and warn when the token was rotated 30 s ago', async () => {
      sessions.findToken.mockResolvedValue(storedToken({ rotatedAt: msBefore(ROTATION_GRACE_MS) }));

      await expect(service.refresh('token')).rejects.toThrow(InvalidRefreshTokenError);
      expect(sessions.revokeSession).toHaveBeenCalledWith('session-1', NOW);
      expect(warn).toHaveBeenCalledWith(
        { userId: ACCOUNT.user.id, sessionId: 'session-1' },
        expect.any(String),
      );
      expect(sessions.rotate).not.toHaveBeenCalled();
    });

    it('should revoke the session without a successor when the membership is gone', async () => {
      accounts.findAccount.mockResolvedValue(null);

      await expect(service.refresh('token')).rejects.toThrow(InvalidRefreshTokenError);
      expect(sessions.revokeSession).toHaveBeenCalledWith('session-1', NOW);
      expect(sessions.rotate).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should resolve without revoking when the token is unknown', async () => {
      sessions.findToken.mockResolvedValue(null);

      await expect(service.logout('unknown')).resolves.toBeUndefined();
      expect(sessions.revokeSession).not.toHaveBeenCalled();
    });

    it('should revoke the token’s session when the token is known', async () => {
      await service.logout('token');

      expect(sessions.revokeSession).toHaveBeenCalledWith('session-1', NOW);
    });
  });
});
