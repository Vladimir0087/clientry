import { Injectable, Logger } from '@nestjs/common';

import { INVITE_LIMITS } from '@clientry/shared/workspaces';
import type { CreatedInviteResponse, InviteListResponse } from '@clientry/shared/workspaces';

import { assertCallerPermission } from './caller-permission.js';
import { InviteLimitReachedError, InviteNotFoundError } from './errors.js';
import { InvitesRepository } from './invites.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/crypto/opaque-token.js';

// Only the hash is stored, so the database never holds a usable link; the token is shown once.
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(private readonly invites: InvitesRepository) {}

  async list(user: AuthUser): Promise<InviteListResponse> {
    return { items: await this.invites.listPending(user.workspaceId, new Date()) };
  }

  // Under the workspace lock, so concurrent creates cannot pass the pending limit together.
  async create(user: AuthUser): Promise<CreatedInviteResponse> {
    const { workspaceId } = user;
    const now = new Date();
    const token = generateOpaqueToken();
    const invite = await this.invites.inWorkspaceLock(workspaceId, async (locked) => {
      assertCallerPermission(await locked.findRole(workspaceId, user.id), 'team.manage');
      if ((await locked.countPending(workspaceId, now)) >= INVITE_LIMITS.pending) {
        throw new InviteLimitReachedError();
      }
      return locked.create(workspaceId, {
        createdById: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + INVITE_LIMITS.lifetimeMs),
      });
    });
    this.logger.log({ workspaceId, userId: user.id, inviteId: invite.id }, 'Invite created');
    return { ...invite, token };
  }

  async revoke(user: AuthUser, id: string): Promise<void> {
    const { workspaceId } = user;
    const now = new Date();
    await this.invites.inWorkspaceLock(workspaceId, async (locked) => {
      assertCallerPermission(await locked.findRole(workspaceId, user.id), 'team.manage');
      if (!(await locked.revoke(workspaceId, id, now))) {
        throw new InviteNotFoundError();
      }
    });
    this.logger.log({ workspaceId, userId: user.id, inviteId: id }, 'Invite revoked');
  }
}
