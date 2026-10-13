import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import type { Member } from '@clientry/shared/workspaces';

import { LastOwnerError, MemberNotFoundError } from './errors.js';
import type {
  LockedMembersRepository,
  MembersOperation,
  MembersRepository,
} from './members.repository.js';
import { MembersService } from './members.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';
import { InsufficientRoleError } from '../auth/errors.js';

const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: WORKSPACE_ID,
  role: 'owner',
};

function member(id: string, name: string, role: Member['role']): Member {
  return {
    id,
    name,
    email: `${name.toLowerCase()}@studio.dev`,
    role,
    joinedAt: '2026-10-01T08:00:00.000Z',
  };
}

const ANN = member(OWNER.id, 'Ann', 'owner');
const MAX = member('0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', 'Max', 'manager');
const KIM = member('0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e70', 'Kim', 'manager');

const MEMBERS: Readonly<Record<string, Member>> = { [ANN.id]: ANN, [MAX.id]: MAX, [KIM.id]: KIM };

type LockedMock = {
  readonly [K in keyof LockedMembersRepository]: Mock<LockedMembersRepository[K]>;
};

function createLockedMock(): LockedMock {
  return {
    findRole: vi.fn<LockedMembersRepository['findRole']>().mockResolvedValue('owner'),
    findMember: vi
      .fn<LockedMembersRepository['findMember']>()
      .mockImplementation((_workspaceId, userId) => Promise.resolve(MEMBERS[userId] ?? null)),
    countOwners: vi.fn<LockedMembersRepository['countOwners']>().mockResolvedValue(1),
    updateRole: vi
      .fn<LockedMembersRepository['updateRole']>()
      .mockImplementation((_workspaceId, userId, role) =>
        Promise.resolve({ ...(MEMBERS[userId] ?? MAX), role }),
      ),
    lockOpenTasks: vi.fn<LockedMembersRepository['lockOpenTasks']>().mockResolvedValue(undefined),
    deleteMembership: vi
      .fn<LockedMembersRepository['deleteMembership']>()
      .mockResolvedValue(undefined),
    handOverDeals: vi.fn<LockedMembersRepository['handOverDeals']>().mockResolvedValue(2),
    handOverTasks: vi.fn<LockedMembersRepository['handOverTasks']>().mockResolvedValue(3),
    revokeSessions: vi.fn<LockedMembersRepository['revokeSessions']>().mockResolvedValue(1),
    revokePendingInvitesCreatedBy: vi
      .fn<LockedMembersRepository['revokePendingInvitesCreatedBy']>()
      .mockResolvedValue(undefined),
  };
}

const WRITES = [
  'updateRole',
  'lockOpenTasks',
  'deleteMembership',
  'handOverDeals',
  'handOverTasks',
  'revokeSessions',
  'revokePendingInvitesCreatedBy',
] as const satisfies readonly (keyof LockedMembersRepository)[];

describe('MembersService', () => {
  let locked: LockedMock;
  let service: MembersService;
  let log: MockInstance<Logger['log']>;
  let lockRuns: Mock<(workspaceId: string, operation: MembersOperation) => void>;

  function expectNoWrite(): void {
    for (const write of WRITES) {
      expect(locked[write]).not.toHaveBeenCalled();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z'), toFake: ['Date'] });
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    locked = createLockedMock();
    lockRuns = vi.fn<(workspaceId: string, operation: MembersOperation) => void>();
    const repository: MembersRepository = {
      list: vi.fn<MembersRepository['list']>().mockResolvedValue([ANN, MAX]),
      inWorkspaceLock: (workspaceId, operation, work) => {
        lockRuns(workspaceId, operation);
        return work(locked);
      },
    };
    service = new MembersService(repository);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('updateRole', () => {
    it('should throw LastOwnerError without an update when the only owner is demoted', async () => {
      await expect(service.updateRole(OWNER, ANN.id, { role: 'manager' })).rejects.toThrow(
        LastOwnerError,
      );
      expectNoWrite();
    });

    it('should update the role when one of two owners is demoted', async () => {
      locked.countOwners.mockResolvedValue(2);

      const updated = await service.updateRole(OWNER, ANN.id, { role: 'manager' });

      expect(updated.role).toBe('manager');
      expect(locked.updateRole).toHaveBeenCalledWith(WORKSPACE_ID, ANN.id, 'manager');
    });

    it('should revoke the pending invites the member created after the update when an owner is demoted', async () => {
      locked.countOwners.mockResolvedValue(2);

      await service.updateRole(OWNER, ANN.id, { role: 'manager' });

      expect(locked.revokePendingInvitesCreatedBy).toHaveBeenCalledWith(
        WORKSPACE_ID,
        ANN.id,
        new Date('2026-10-12T10:00:00.000Z'),
      );
      expect(
        locked.updateRole.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      ).toBeLessThan(locked.revokePendingInvitesCreatedBy.mock.invocationCallOrder[0] ?? 0);
    });

    it('should keep invites when a manager is promoted', async () => {
      await service.updateRole(OWNER, MAX.id, { role: 'owner' });

      expect(locked.revokePendingInvitesCreatedBy).not.toHaveBeenCalled();
    });

    it('should return the member without a write when the role is the same', async () => {
      const result = await service.updateRole(OWNER, MAX.id, { role: 'manager' });

      expect(result).toEqual(MAX);
      expectNoWrite();
    });

    it('should throw MemberNotFoundError when the user is not a member', async () => {
      await expect(
        service.updateRole(OWNER, '0199a3c4-0000-7000-8000-000000000000', { role: 'owner' }),
      ).rejects.toThrow(MemberNotFoundError);
    });

    it('should log ids and both roles only when the role changes', async () => {
      await service.updateRole(OWNER, MAX.id, { role: 'owner' });

      expect(log).toHaveBeenCalledWith(
        {
          workspaceId: WORKSPACE_ID,
          userId: OWNER.id,
          memberId: MAX.id,
          from: 'manager',
          to: 'owner',
        },
        'Member role changed',
      );
    });

    it('should name the operation members.updateRole when a role changes', async () => {
      await service.updateRole(OWNER, MAX.id, { role: 'owner' });

      expect(lockRuns).toHaveBeenCalledWith(WORKSPACE_ID, 'members.updateRole');
    });
  });

  describe('remove', () => {
    it('should run every step through the locked unit of work in order when a manager is removed', async () => {
      await service.remove(OWNER, MAX.id, { transferTo: ANN.id });

      const steps = [
        locked.findRole,
        locked.lockOpenTasks,
        locked.deleteMembership,
        locked.handOverDeals,
        locked.handOverTasks,
        locked.revokeSessions,
        locked.revokePendingInvitesCreatedBy,
      ].map((step) => step.mock.invocationCallOrder[0] ?? 0);
      expect(steps).toEqual(steps.toSorted((a, b) => a - b));
      expect(steps.every((order) => order > 0)).toBe(true);
    });

    it('should hand deals and tasks to transferTo with the caller as actor when a manager is removed', async () => {
      await service.remove(OWNER, MAX.id, { transferTo: KIM.id });

      const handover = {
        actorId: OWNER.id,
        member: { id: MAX.id, name: 'Max' },
        receiver: { id: KIM.id, name: 'Kim' },
      };
      expect(locked.handOverDeals).toHaveBeenCalledWith(WORKSPACE_ID, handover);
      expect(locked.handOverTasks).toHaveBeenCalledWith(WORKSPACE_ID, handover);
      expect(locked.revokeSessions).toHaveBeenCalledWith(MAX.id, new Date());
      expect(locked.revokePendingInvitesCreatedBy).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MAX.id,
        new Date(),
      );
    });

    it('should throw LastOwnerError without a write when the only owner is removed', async () => {
      await expect(service.remove(OWNER, ANN.id, { transferTo: MAX.id })).rejects.toThrow(
        LastOwnerError,
      );
      expectNoWrite();
    });

    it.each([
      ['the removed member', MAX.id],
      ['not a member', '0199a3c4-0000-7000-8000-000000000000'],
    ])(
      'should throw RequestValidationError on transferTo without a write when it is %s',
      async (_case, transferTo) => {
        const result = service.remove(OWNER, MAX.id, { transferTo });

        await expect(result).rejects.toBeInstanceOf(RequestValidationError);
        await expect(result).rejects.toMatchObject({
          fieldErrors: [{ path: 'transferTo', message: 'Choose another member' }],
        });
        expectNoWrite();
      },
    );

    it('should throw MemberNotFoundError before checking transferTo when the member is unknown', async () => {
      const unknown = '0199a3c4-0000-7000-8000-000000000000';

      await expect(service.remove(OWNER, unknown, { transferTo: unknown })).rejects.toThrow(
        MemberNotFoundError,
      );
    });

    it('should log ids and counts only when a member is removed', async () => {
      await service.remove(OWNER, MAX.id, { transferTo: ANN.id });

      expect(log).toHaveBeenCalledWith(
        {
          workspaceId: WORKSPACE_ID,
          userId: OWNER.id,
          memberId: MAX.id,
          transferTo: ANN.id,
          handedDeals: 2,
          handedTasks: 3,
          revokedSessions: 1,
        },
        'Member removed',
      );
    });

    it('should name the operation members.remove when a member is removed', async () => {
      await service.remove(OWNER, MAX.id, { transferTo: ANN.id });

      expect(lockRuns).toHaveBeenCalledWith(WORKSPACE_ID, 'members.remove');
    });
  });

  describe('stale caller role', () => {
    it.each(['manager', null] as const)(
      'should throw InsufficientRoleError without a write when a role change re-reads the role %s',
      async (role) => {
        locked.findRole.mockResolvedValue(role);

        await expect(service.updateRole(OWNER, MAX.id, { role: 'owner' })).rejects.toThrow(
          InsufficientRoleError,
        );
        expectNoWrite();
      },
    );

    it.each(['manager', null] as const)(
      'should throw InsufficientRoleError without a write when a removal re-reads the role %s',
      async (role) => {
        locked.findRole.mockResolvedValue(role);

        await expect(service.remove(OWNER, MAX.id, { transferTo: ANN.id })).rejects.toThrow(
          InsufficientRoleError,
        );
        expectNoWrite();
      },
    );
  });
});
