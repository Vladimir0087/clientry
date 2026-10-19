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
  AlreadyInWorkspaceError,
  DemoUnavailableError,
  EmailTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InviteInvalidError,
  NoWorkspaceError,
} from './errors.js';
import type { PasswordHasher } from './password-hasher.js';
import type { SessionsRepository, StoredRefreshToken } from './sessions.repository.js';
import { opaqueTokenHash } from '../../../test/support/auth-tokens.js';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const PASSWORD = 'correct horse battery';

const ACCOUNT: Account = {
  user: { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', email: 'ann@studio.dev', name: 'Ann' },
  workspace: { id: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e', name: 'Pixel Studio', isDemo: false },
  role: 'owner',
};

const MANAGER_ACCOUNT: Account = { ...ACCOUNT, role: 'manager' };

const INVITE_ID = '0199b0d2-1a2b-7c3d-8e4f-5a6b7c8d9e0f';
const INVITE_TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';
const PREVIOUS_REFRESH_TOKEN = 'previous-refresh-token';

const INVITE_REGISTRATION = {
  token: INVITE_TOKEN,
  email: 'max@studio.dev',
  password: PASSWORD,
  name: 'Max',
};

const INVITE_LOGIN = { token: INVITE_TOKEN, email: 'max@studio.dev', password: PASSWORD };

const INVITE_PREVIEW = {
  workspace: { name: 'Pixel Studio' },
  invitedBy: { name: 'Ann' },
  expiresAt: '2026-10-16T09:30:00.000Z',
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
    findDemoAccount: vi.fn<AccountsRepository['findDemoAccount']>().mockResolvedValue(null),
    findInvitePreview: vi.fn<AccountsRepository['findInvitePreview']>().mockResolvedValue(null),
    createInvitedAccount: vi
      .fn<AccountsRepository['createInvitedAccount']>()
      .mockResolvedValue({ account: MANAGER_ACCOUNT, inviteId: INVITE_ID }),
    joinByInvite: vi
      .fn<AccountsRepository['joinByInvite']>()
      .mockResolvedValue({ account: MANAGER_ACCOUNT, inviteId: INVITE_ID }),
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
  let log: MockInstance<Logger['log']>;
  let service: AuthService;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
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

    it('should throw NoWorkspaceError when the member is removed before the session starts', async () => {
      sessions.createSession.mockResolvedValue(null);

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
        { id: ACCOUNT.user.id, workspaceId: ACCOUNT.workspace.id, role: 'owner', isDemo: false },
        'session-new',
      );
    });
  });

  describe('startDemoSession', () => {
    const DEMO_MANAGER: Account = {
      user: { id: '0199d0a0-0000-7000-8000-000000000002', email: 'max@x.example', name: 'Max' },
      workspace: { id: '0199d0a0-0000-7000-8000-000000000100', name: 'Pixel Studio', isDemo: true },
      role: 'manager',
    };

    beforeEach(() => {
      accounts.findDemoAccount.mockResolvedValue(DEMO_MANAGER);
    });

    it('should ask the repository for the demo account of the role when a demo session starts', async () => {
      await service.startDemoSession('manager');

      expect(accounts.findDemoAccount).toHaveBeenCalledWith('manager');
    });

    it("should delete the demo user's ended sessions before the new one when a demo session starts", async () => {
      await service.startDemoSession('manager');

      expect(sessions.deleteEndedSessions).toHaveBeenCalledWith(DEMO_MANAGER.user.id, NOW);
      expect(sessions.deleteEndedSessions.mock.invocationCallOrder[0]).toBeLessThan(
        sessions.createSession.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('should sign a demo session and return the demo account when the demo exists', async () => {
      const issued = await service.startDemoSession('manager');

      expect(issued.session).toEqual(DEMO_MANAGER);
      expect(tokens.sign).toHaveBeenCalledWith(
        {
          id: DEMO_MANAGER.user.id,
          workspaceId: DEMO_MANAGER.workspace.id,
          role: 'manager',
          isDemo: true,
        },
        'session-new',
      );
    });

    it('should log the user and the role when a demo session starts', async () => {
      await service.startDemoSession('manager');

      expect(log).toHaveBeenCalledWith(
        { userId: DEMO_MANAGER.user.id, role: 'manager' },
        'Demo session started',
      );
    });

    it('should throw DemoUnavailableError and start no session when there is no demo yet', async () => {
      accounts.findDemoAccount.mockResolvedValue(null);

      await expect(service.startDemoSession('owner')).rejects.toThrow(DemoUnavailableError);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('should throw NoWorkspaceError when the membership is gone before the session starts', async () => {
      sessions.createSession.mockResolvedValue(null);

      await expect(service.startDemoSession('manager')).rejects.toThrow(NoWorkspaceError);
    });
  });

  describe('registerByInvite', () => {
    it('should hash the password before the repository call when joining', async () => {
      await service.registerByInvite(INVITE_REGISTRATION, undefined);

      expect(accounts.createInvitedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'new-hash', email: 'max@studio.dev', now: NOW }),
      );
      expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
        accounts.createInvitedAccount.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('should look the invite up by the hash of the token when joining', async () => {
      await service.registerByInvite(INVITE_REGISTRATION, undefined);

      const [input] = accounts.createInvitedAccount.mock.calls[0] ?? [];
      expect(
        Buffer.from(input?.tokenHash ?? []).equals(Buffer.from(opaqueTokenHash(INVITE_TOKEN))),
      ).toBe(true);
    });

    it.each([new InviteInvalidError(), new EmailTakenError()])(
      'should propagate %s and keep the previous session when the join fails',
      async (error) => {
        accounts.createInvitedAccount.mockRejectedValue(error);

        await expect(
          service.registerByInvite(INVITE_REGISTRATION, PREVIOUS_REFRESH_TOKEN),
        ).rejects.toThrow(error);
        expect(sessions.revokeSession).not.toHaveBeenCalled();
        expect(sessions.createSession).not.toHaveBeenCalled();
      },
    );

    it('should revoke the session of the presented refresh token when the join succeeds', async () => {
      await service.registerByInvite(INVITE_REGISTRATION, PREVIOUS_REFRESH_TOKEN);

      const [presentedHash] = sessions.findToken.mock.calls[0] ?? [];
      expect(
        Buffer.from(presentedHash ?? []).equals(
          Buffer.from(opaqueTokenHash(PREVIOUS_REFRESH_TOKEN)),
        ),
      ).toBe(true);
      expect(sessions.revokeSession).toHaveBeenCalledWith('session-1', NOW);
      expect(sessions.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: MANAGER_ACCOUNT.user.id }),
      );
    });

    it('should throw NoWorkspaceError and keep the presented session when the session is refused', async () => {
      sessions.createSession.mockResolvedValue(null);

      await expect(
        service.registerByInvite(INVITE_REGISTRATION, PREVIOUS_REFRESH_TOKEN),
      ).rejects.toThrow(NoWorkspaceError);
      expect(sessions.revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('loginByInvite', () => {
    const NO_MEMBERSHIP = { userId: ACCOUNT.user.id, passwordHash: 'stored-hash', account: null };

    beforeEach(() => {
      accounts.findInvitePreview.mockResolvedValue(INVITE_PREVIEW);
      accounts.findCredentialsByEmail.mockResolvedValue(NO_MEMBERSHIP);
    });

    it('should throw InviteInvalidError without reading the credentials when the invite is not pending', async () => {
      accounts.findInvitePreview.mockResolvedValue(null);

      await expect(service.loginByInvite(INVITE_LOGIN, undefined)).rejects.toThrow(
        InviteInvalidError,
      );
      expect(accounts.findCredentialsByEmail).not.toHaveBeenCalled();
      expect(hasher.verify).not.toHaveBeenCalled();
      expect(hasher.verifyDummy).not.toHaveBeenCalled();
    });

    it('should check the dummy hash and throw InvalidCredentialsError when the email is unknown', async () => {
      accounts.findCredentialsByEmail.mockResolvedValue(null);

      await expect(service.loginByInvite(INVITE_LOGIN, undefined)).rejects.toThrow(
        InvalidCredentialsError,
      );
      expect(hasher.verifyDummy).toHaveBeenCalledWith(PASSWORD);
      expect(accounts.joinByInvite).not.toHaveBeenCalled();
    });

    it('should throw AlreadyInWorkspaceError without a claim when the account has a membership', async () => {
      accounts.findCredentialsByEmail.mockResolvedValue({ ...NO_MEMBERSHIP, account: ACCOUNT });

      await expect(service.loginByInvite(INVITE_LOGIN, undefined)).rejects.toThrow(
        AlreadyInWorkspaceError,
      );
      expect(accounts.joinByInvite).not.toHaveBeenCalled();
    });

    it('should delete ended sessions, start one and revoke the presented one when the join succeeds', async () => {
      await service.loginByInvite(INVITE_LOGIN, PREVIOUS_REFRESH_TOKEN);

      expect(accounts.joinByInvite).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ACCOUNT.user.id, now: NOW }),
      );
      expect(sessions.deleteEndedSessions).toHaveBeenCalledWith(ACCOUNT.user.id, NOW);
      expect(sessions.revokeSession).toHaveBeenCalledWith('session-1', NOW);
      expect(sessions.createSession).toHaveBeenCalledTimes(1);
    });

    it('should delete ended sessions before the claim when the join succeeds', async () => {
      await service.loginByInvite(INVITE_LOGIN, PREVIOUS_REFRESH_TOKEN);

      expect(
        sessions.deleteEndedSessions.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      ).toBeLessThan(accounts.joinByInvite.mock.invocationCallOrder[0] ?? 0);
    });

    it('should keep the presented session when the invite is invalid', async () => {
      accounts.joinByInvite.mockRejectedValue(new InviteInvalidError());

      await expect(service.loginByInvite(INVITE_LOGIN, PREVIOUS_REFRESH_TOKEN)).rejects.toThrow(
        InviteInvalidError,
      );
      expect(sessions.revokeSession).not.toHaveBeenCalled();
    });

    it('should throw NoWorkspaceError and keep the presented session when the session is refused', async () => {
      sessions.createSession.mockResolvedValue(null);

      await expect(service.loginByInvite(INVITE_LOGIN, PREVIOUS_REFRESH_TOKEN)).rejects.toThrow(
        NoWorkspaceError,
      );
      expect(sessions.revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('previewInvite', () => {
    it('should throw InviteInvalidError when no pending invite matches', async () => {
      await expect(service.previewInvite(INVITE_TOKEN)).rejects.toThrow(InviteInvalidError);
    });

    it('should return the preview when a pending invite matches', async () => {
      accounts.findInvitePreview.mockResolvedValue(INVITE_PREVIEW);

      await expect(service.previewInvite(INVITE_TOKEN)).resolves.toEqual(INVITE_PREVIEW);
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
