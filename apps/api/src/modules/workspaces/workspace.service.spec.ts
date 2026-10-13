import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { LockedWorkspaceRepository, WorkspaceRepository } from './workspace.repository.js';
import { WorkspaceService } from './workspace.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { InsufficientRoleError } from '../auth/errors.js';

const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  role: 'owner',
};

type LockedMock = {
  readonly [K in keyof LockedWorkspaceRepository]: Mock<LockedWorkspaceRepository[K]>;
};

describe('WorkspaceService', () => {
  let locked: LockedMock;
  let service: WorkspaceService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    locked = {
      findRole: vi.fn<LockedWorkspaceRepository['findRole']>().mockResolvedValue('owner'),
      rename: vi
        .fn<LockedWorkspaceRepository['rename']>()
        .mockImplementation((id, name) => Promise.resolve({ id, name })),
    };
    const repository: WorkspaceRepository = {
      inWorkspaceLock: (_workspaceId, work) => work(locked),
    };
    service = new WorkspaceService(repository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should rename the caller workspace when the caller is still an owner', async () => {
    const renamed = await service.rename(OWNER, { name: 'Pixel Lab' });

    expect(renamed).toEqual({ id: OWNER.workspaceId, name: 'Pixel Lab' });
  });

  it.each(['manager', null] as const)(
    'should throw InsufficientRoleError without a write when the re-read role is %s',
    async (role) => {
      locked.findRole.mockResolvedValue(role);

      await expect(service.rename(OWNER, { name: 'Pixel Lab' })).rejects.toThrow(
        InsufficientRoleError,
      );
      expect(locked.rename).not.toHaveBeenCalled();
    },
  );
});
