import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { InviteSummary } from '@clientry/shared/workspaces';

import { InviteLimitReachedError, InviteNotFoundError } from './errors.js';
import type { InvitesRepository, LockedInvitesRepository } from './invites.repository.js';
import { InvitesService } from './invites.service.js';
import { opaqueTokenHash } from '../../../test/support/auth-tokens.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { InsufficientRoleError } from '../auth/errors.js';

const NOW = new Date('2026-10-09T09:30:00.000Z');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'owner',
  isDemo: false,
};

const INVITE_ID = '0199b0d2-1a2b-7c3d-8e4f-5a6b7c8d9e0f';

type LockedMock = {
  readonly [K in keyof LockedInvitesRepository]: Mock<LockedInvitesRepository[K]>;
};

function createLockedMock(): LockedMock {
  return {
    findRole: vi.fn<LockedInvitesRepository['findRole']>().mockResolvedValue('owner'),
    countPending: vi.fn<LockedInvitesRepository['countPending']>().mockResolvedValue(0),
    create: vi
      .fn<LockedInvitesRepository['create']>()
      .mockImplementation((_workspaceId, invite): Promise<InviteSummary> =>
        Promise.resolve({
          id: INVITE_ID,
          createdBy: { id: invite.createdById, name: 'Ann' },
          createdAt: NOW.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
        }),
      ),
    revoke: vi.fn<LockedInvitesRepository['revoke']>().mockResolvedValue(true),
  };
}

describe('InvitesService', () => {
  let locked: LockedMock;
  let service: InvitesService;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    locked = createLockedMock();
    const repository: InvitesRepository = {
      listPending: vi.fn<InvitesRepository['listPending']>().mockResolvedValue([]),
      inWorkspaceLock: (_workspaceId, work) => work(locked),
    };
    service = new InvitesService(repository);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should throw InviteLimitReachedError without an insert when 20 invites are pending', async () => {
      locked.countPending.mockResolvedValue(20);

      await expect(service.create(OWNER)).rejects.toThrow(InviteLimitReachedError);
      expect(locked.create).not.toHaveBeenCalled();
    });

    it('should store the hash of the returned token rather than the token when created', async () => {
      const { token } = await service.create(OWNER);

      const [, invite] = locked.create.mock.calls[0] ?? [];
      const stored = Buffer.from(invite?.tokenHash ?? []);
      expect(stored.equals(Buffer.from(opaqueTokenHash(token)))).toBe(true);
      expect(stored.toString('base64url')).not.toBe(token);
    });

    it('should set the expiry 7 days after now when created', async () => {
      const created = await service.create(OWNER);

      expect(created.expiresAt).toBe(new Date(NOW.getTime() + SEVEN_DAYS_MS).toISOString());
    });
  });

  describe('revoke', () => {
    it('should throw InviteNotFoundError when the invite is not pending', async () => {
      locked.revoke.mockResolvedValue(false);

      await expect(service.revoke(OWNER, INVITE_ID)).rejects.toThrow(InviteNotFoundError);
    });
  });

  describe('stale caller role', () => {
    it.each(['manager', null] as const)(
      'should throw InsufficientRoleError without an insert when a create re-reads the role %s',
      async (role) => {
        locked.findRole.mockResolvedValue(role);

        await expect(service.create(OWNER)).rejects.toThrow(InsufficientRoleError);
        expect(locked.create).not.toHaveBeenCalled();
      },
    );

    it.each(['manager', null] as const)(
      'should throw InsufficientRoleError without a revoke when a revoke re-reads the role %s',
      async (role) => {
        locked.findRole.mockResolvedValue(role);

        await expect(service.revoke(OWNER, INVITE_ID)).rejects.toThrow(InsufficientRoleError);
        expect(locked.revoke).not.toHaveBeenCalled();
      },
    );
  });
});
