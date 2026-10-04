import { Injectable } from '@nestjs/common';

import type {
  Account,
  AccountCredentials,
  AccountsRepository,
  NewOwnerAccount,
} from './accounts.repository.js';
import { EmailTakenError } from './errors.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
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

// A new user collides on nothing but the email, so any unique violation here is the email.
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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
      const account = toAccount(row);
      if (!account) {
        throw new Error('Owner membership missing right after it was created');
      }
      return account;
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
}
