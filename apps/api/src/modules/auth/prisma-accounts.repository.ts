import { Injectable } from '@nestjs/common';

import type { InvitePreviewResponse } from '@clientry/shared/auth';

import type {
  Account,
  AccountCredentials,
  AccountsRepository,
  InviteJoin,
  JoinedAccount,
  NewInvitedAccount,
  NewOwnerAccount,
} from './accounts.repository.js';
import { AlreadyInWorkspaceError, EmailTakenError, InviteInvalidError } from './errors.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { pendingInvite } from '../../infra/prisma/pending-invite.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  name: true,
  membership: { select: { role: true, workspace: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type AccountRow = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

function toAccount(row: AccountRow): Account | null {
  if (!row.membership) {
    return null;
  }
  const { id, email, name, membership } = row;
  return { user: { id, email, name }, workspace: membership.workspace, role: membership.role };
}

function ownerAccountData(input: NewOwnerAccount): Prisma.UserCreateInput {
  return {
    email: input.email,
    passwordHash: input.passwordHash,
    name: input.name,
    membership: {
      create: {
        role: 'owner',
        workspace: {
          create: {
            name: input.workspaceName,
            stages: { createMany: { data: [...input.stages] } },
          },
        },
      },
    },
  };
}

// A new user collides on nothing but the email, and a new membership on nothing but the user.
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function requireAccount(row: AccountRow): Account {
  const account = toAccount(row);
  if (!account) {
    throw new Error(`Membership of user ${row.id} missing right after it was created`);
  }
  return account;
}

interface ClaimedInvite {
  readonly id: string;
  readonly workspaceId: string;
}

// The conditional update lets one of two concurrent joins through; the other waits and matches none.
async function claimInvite(
  tx: Prisma.TransactionClient,
  tokenHash: Uint8Array<ArrayBuffer>,
  now: Date,
): Promise<ClaimedInvite> {
  const { count } = await tx.invite.updateMany({
    where: { tokenHash, ...pendingInvite(now) },
    data: { usedAt: now },
  });
  if (count === 0) {
    throw new InviteInvalidError();
  }
  return tx.invite.findUniqueOrThrow({
    where: { tokenHash },
    select: { id: true, workspaceId: true },
  });
}

@Injectable()
export class PrismaAccountsRepository implements AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOwnerAccount(input: NewOwnerAccount): Promise<Account> {
    try {
      // One nested write runs as one transaction: user, workspace, membership and stages.
      const row = await this.prisma.user.create({
        data: ownerAccountData(input),
        select: ACCOUNT_SELECT,
      });
      return requireAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new EmailTakenError();
      }
      throw error;
    }
  }

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { ...ACCOUNT_SELECT, passwordHash: true },
    });
    if (!row) {
      return null;
    }
    return { userId: row.id, passwordHash: row.passwordHash, account: toAccount(row) };
  }

  async findAccount(userId: string): Promise<Account | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ACCOUNT_SELECT,
    });
    return row ? toAccount(row) : null;
  }

  async findInvitePreview(
    tokenHash: Uint8Array<ArrayBuffer>,
    now: Date,
  ): Promise<InvitePreviewResponse | null> {
    const row = await this.prisma.invite.findFirst({
      where: { tokenHash, ...pendingInvite(now) },
      select: {
        expiresAt: true,
        workspace: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!row) {
      return null;
    }
    return {
      workspace: row.workspace,
      invitedBy: row.createdBy,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async createInvitedAccount(input: NewInvitedAccount): Promise<JoinedAccount> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invite = await claimInvite(tx, input.tokenHash, input.now);
        const row = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            name: input.name,
            membership: {
              create: { role: 'manager', workspace: { connect: { id: invite.workspaceId } } },
            },
          },
          select: ACCOUNT_SELECT,
        });
        await tx.invite.update({ where: { id: invite.id }, data: { usedById: row.id } });
        return { account: requireAccount(row), inviteId: invite.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new EmailTakenError();
      }
      throw error;
    }
  }

  async joinByInvite({ tokenHash, userId, now }: InviteJoin): Promise<JoinedAccount> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invite = await claimInvite(tx, tokenHash, now);
        await tx.membership.create({
          data: { userId, workspaceId: invite.workspaceId, role: 'manager' },
          select: { id: true },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { usedById: userId } });
        const row = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: ACCOUNT_SELECT,
        });
        return { account: requireAccount(row), inviteId: invite.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AlreadyInWorkspaceError();
      }
      throw error;
    }
  }
}
