import { Injectable, Logger } from '@nestjs/common';

import { hasPermission } from '@clientry/shared/auth';
import { TRANSFER_TO_MESSAGE } from '@clientry/shared/workspaces';
import type {
  Member,
  MemberListResponse,
  RemoveMemberQuery,
  UpdateMemberRequest,
} from '@clientry/shared/workspaces';

import { assertCallerPermission } from './caller-permission.js';
import { LastOwnerError, MemberNotFoundError } from './errors.js';
import { MembersRepository } from './members.repository.js';
import type { LockedMembersRepository, MemberRef } from './members.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

interface RoleChange {
  readonly member: Member;
  readonly from: Member['role'] | null;
}

interface Removal {
  readonly handedDeals: number;
  readonly handedTasks: number;
  readonly revokedSessions: number;
}

async function requireMember(
  locked: LockedMembersRepository,
  workspaceId: string,
  userId: string,
): Promise<Member> {
  const member = await locked.findMember(workspaceId, userId);
  if (!member) {
    throw new MemberNotFoundError();
  }
  return member;
}

// One message for the removed member, a non-member and another workspace's user.
async function requireReceiver(
  locked: LockedMembersRepository,
  workspaceId: string,
  memberId: string,
  transferTo: string,
): Promise<Member> {
  const receiver =
    transferTo === memberId ? null : await locked.findMember(workspaceId, transferTo);
  if (!receiver) {
    throw new RequestValidationError([{ path: 'transferTo', message: TRANSFER_TO_MESSAGE }]);
  }
  return receiver;
}

// Called only for a target who is an owner, so one owner left means the target is the last one.
async function assertAnotherOwner(
  locked: LockedMembersRepository,
  workspaceId: string,
): Promise<void> {
  if ((await locked.countOwners(workspaceId)) <= 1) {
    throw new LastOwnerError();
  }
}

function toRef({ id, name }: Member): MemberRef {
  return { id, name };
}

// Writes run under the workspace lock, so two owners demoting each other cannot leave none.
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private readonly members: MembersRepository) {}

  async list(user: AuthUser): Promise<MemberListResponse> {
    return { items: await this.members.list(user.workspaceId) };
  }

  async updateRole(user: AuthUser, id: string, { role }: UpdateMemberRequest): Promise<Member> {
    const { workspaceId } = user;
    const now = new Date();
    const change = await this.members.inWorkspaceLock<RoleChange>(
      workspaceId,
      'members.updateRole',
      async (locked) => {
        assertCallerPermission(await locked.findRole(workspaceId, user.id), 'team.manage');
        const member = await requireMember(locked, workspaceId, id);
        if (member.role === role) {
          return { member, from: null };
        }
        if (member.role === 'owner') {
          await assertAnotherOwner(locked, workspaceId);
        }
        const updated = await locked.updateRole(workspaceId, id, role);
        // Invites are made with team.manage, so the pending ones go when the member loses it.
        if (!hasPermission(role, 'team.manage')) {
          await locked.revokePendingInvitesCreatedBy(workspaceId, id, now);
        }
        return { member: updated, from: member.role };
      },
    );
    if (change.from !== null) {
      this.logger.log(
        { workspaceId, userId: user.id, memberId: id, from: change.from, to: role },
        'Member role changed',
      );
    }
    return change.member;
  }

  // Lock order: tasks, membership, deals; the order task and deal writes take them in.
  async remove(user: AuthUser, id: string, { transferTo }: RemoveMemberQuery): Promise<void> {
    const { workspaceId } = user;
    const now = new Date();
    const removal = await this.members.inWorkspaceLock<Removal>(
      workspaceId,
      'members.remove',
      async (locked) => {
        assertCallerPermission(await locked.findRole(workspaceId, user.id), 'team.manage');
        const member = await requireMember(locked, workspaceId, id);
        const receiver = await requireReceiver(locked, workspaceId, id, transferTo);
        if (member.role === 'owner') {
          await assertAnotherOwner(locked, workspaceId);
        }
        await locked.lockOpenTasks(workspaceId, id);
        await locked.deleteMembership(workspaceId, id);
        const handover = { actorId: user.id, member: toRef(member), receiver: toRef(receiver) };
        const handedDeals = await locked.handOverDeals(workspaceId, handover);
        const handedTasks = await locked.handOverTasks(workspaceId, handover);
        const revokedSessions = await locked.revokeSessions(id, now);
        await locked.revokePendingInvitesCreatedBy(workspaceId, id, now);
        return { handedDeals, handedTasks, revokedSessions };
      },
    );
    this.logger.log(
      { workspaceId, userId: user.id, memberId: id, transferTo, ...removal },
      'Member removed',
    );
  }
}
