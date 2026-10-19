import { Injectable } from '@nestjs/common';

import type {
  DemoMembershipRow,
  DemoUserRow,
  DemoWorkspace,
  DemoWorkspaceRow,
} from './demo-rows.js';
import type { DemoRepository } from './demo.repository.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

// Above Prisma's defaults: the first statement may wake Neon.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

interface UserState {
  readonly id: string;
  readonly is_member: boolean;
}

// FOR UPDATE, not lockWorkspace's NO KEY UPDATE: it also conflicts with the KEY SHARE that inserts'
// foreign key checks take, so a write to the demo waits for the reset and lands in the new data.
async function lockWorkspace(tx: Prisma.TransactionClient, row: DemoWorkspaceRow): Promise<void> {
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${row.id}::uuid FOR UPDATE`;
  await tx.$executeRaw`
    INSERT INTO workspaces (id, name, is_demo, created_at, updated_at)
    VALUES (${row.id}::uuid, ${row.name}, true, ${row.createdAt}, ${row.createdAt})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true
    WHERE workspaces.name <> EXCLUDED.name OR NOT workspaces.is_demo`;
}

// Membership by user id; a user missing from the map does not exist yet.
async function findUserStates(
  tx: Prisma.TransactionClient,
  users: readonly DemoUserRow[],
): Promise<ReadonlyMap<string, boolean>> {
  const ids = users.map(({ id }) => id);
  const rows = await tx.$queryRaw<UserState[]>`
    SELECT u.id, m.user_id IS NOT NULL AS is_member
    FROM users u LEFT JOIN memberships m ON m.user_id = u.id
    WHERE u.id = ANY(${ids}::uuid[])`;
  return new Map(rows.map(({ id, is_member }) => [id, is_member]));
}

// Hashed one at a time: argon2 takes 19 MB per hash on a 512 MB instance.
async function writeUsers(
  tx: Prisma.TransactionClient,
  users: readonly DemoUserRow[],
  states: ReadonlyMap<string, boolean>,
  unusableHash: () => Promise<string>,
): Promise<void> {
  const missing = users.filter(({ id }) => !states.has(id));
  if (missing.length > 0) {
    const data: Prisma.UserCreateManyInput[] = [];
    for (const user of missing) {
      data.push({ ...user, passwordHash: await unusableHash(), updatedAt: user.createdAt });
    }
    await tx.user.createMany({ data });
  }
  const values = users.map(({ id, name, email }) => Prisma.sql`(${id}::uuid, ${name}, ${email})`);
  await tx.$executeRaw`
    UPDATE users SET name = v.name, email = v.email
    FROM (VALUES ${Prisma.join(values)}) AS v(id, name, email)
    WHERE users.id = v.id AND (users.name, users.email) IS DISTINCT FROM (v.name, v.email)`;
}

// Children first, as the foreign keys need.
async function deleteRecords(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  const where = { workspaceId };
  await tx.notification.deleteMany({ where });
  await tx.activity.deleteMany({ where });
  await tx.task.deleteMany({ where });
  await tx.deal.deleteMany({ where });
  await tx.client.deleteMany({ where });
  await tx.stage.deleteMany({ where });
  await tx.invite.deleteMany({ where });
}

// Nothing in the demo can change a membership, so existing ones keep their roles and join dates.
async function insertMissingMemberships(
  tx: Prisma.TransactionClient,
  memberships: readonly DemoMembershipRow[],
  states: ReadonlyMap<string, boolean>,
): Promise<void> {
  const missing = memberships.filter(({ userId }) => states.get(userId) !== true);
  if (missing.length > 0) {
    await tx.membership.createMany({
      data: missing.map((membership) => ({ ...membership, updatedAt: membership.createdAt })),
    });
  }
}

async function insertRecords(tx: Prisma.TransactionClient, demo: DemoWorkspace): Promise<void> {
  await tx.stage.createMany({ data: [...demo.stages] });
  await tx.client.createMany({
    data: demo.clients.map((client) => ({ ...client, tags: [...client.tags] })),
  });
  await tx.deal.createMany({ data: [...demo.deals] });
  await tx.task.createMany({ data: [...demo.tasks] });
  await tx.activity.createMany({ data: [...demo.activities] });
  await tx.notification.createMany({ data: [...demo.notifications] });
}

// The one writer outside the domain services: the reset loads a whole workspace with backdated
// history, which no domain operation writes. The same statements run whatever visitors added.
@Injectable()
export class PrismaDemoRepository implements DemoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replace(demo: DemoWorkspace, unusableHash: () => Promise<string>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, demo.workspace);
      const states = await findUserStates(tx, demo.users);
      await writeUsers(tx, demo.users, states, unusableHash);
      await deleteRecords(tx, demo.workspace.id);
      await insertMissingMemberships(tx, demo.memberships, states);
      await insertRecords(tx, demo);
    }, TRANSACTION_OPTIONS);
  }
}
