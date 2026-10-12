import type { Task, TaskRef, TaskRelatedRequest } from '@clientry/shared/tasks';

import {
  deletedButLinksVisible,
  findLockedTask,
  findTask,
  lockTask,
  TASK_LINK_JOINS,
  TASK_LINKS_VISIBLE,
  visible,
} from './task-reads.repository.js';
import type { NewTask, TaskOwnership, TasksTransaction, TaskWrite } from './tasks.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';

interface OwnershipRow {
  readonly created_by_id: string;
  readonly is_deleted: boolean;
  readonly is_hidden: boolean;
}

interface DealRow {
  readonly id: string;
  readonly name: string;
  readonly client_id: string;
}

interface LinkColumns {
  readonly clientId: string | null;
  readonly dealId: string | null;
}

function toLinkColumns(related: TaskRelatedRequest | null): LinkColumns {
  return {
    clientId: related?.kind === 'client' ? related.id : null,
    dealId: related?.kind === 'deal' ? related.id : null,
  };
}

function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(value) : value;
}

function toData(write: TaskWrite): Prisma.TaskUncheckedUpdateManyInput {
  const { related, dueAt, remindAt, doneAt, ...fields } = write;
  return {
    ...fields,
    ...(related === undefined ? {} : toLinkColumns(related)),
    dueAt: dueAt === undefined ? undefined : new Date(dueAt),
    remindAt: toDate(remindAt),
    doneAt: toDate(doneAt),
  };
}

export class PrismaTasksTransaction implements TasksTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findById(workspaceId: string, id: string): Promise<Task | null> {
    return findLockedTask(this.tx, workspaceId, id);
  }

  async findMember(workspaceId: string, userId: string): Promise<TaskRef | null> {
    const [member] = await this.tx.$queryRaw<TaskRef[]>`
      SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ${workspaceId}::uuid AND m.user_id = ${userId}::uuid
      FOR SHARE OF m`;
    return member ?? null;
  }

  async findClient(workspaceId: string, clientId: string): Promise<TaskRef | null> {
    const [client] = await this.tx.$queryRaw<TaskRef[]>`
      SELECT id, name FROM clients
      WHERE id = ${clientId}::uuid AND workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
      FOR SHARE`;
    return client ?? null;
  }

  // The deal's client is locked too: deleting it hides the deal as much as deleting the deal. Two
  // statements, deal first: one over the join would drop a deal whose client changed meanwhile.
  async findDeal(workspaceId: string, dealId: string): Promise<TaskRef | null> {
    const [deal] = await this.tx.$queryRaw<DealRow[]>`
      SELECT id, title AS name, client_id FROM deals
      WHERE id = ${dealId}::uuid AND workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
      FOR SHARE`;
    if (!deal) {
      return null;
    }
    const clients = await this.tx.$queryRaw<unknown[]>`
      SELECT 1 FROM clients
      WHERE id = ${deal.client_id}::uuid AND workspace_id = ${workspaceId}::uuid
        AND deleted_at IS NULL
      FOR SHARE`;
    return clients.length > 0 ? { id: deal.id, name: deal.name } : null;
  }

  async create(workspaceId: string, createdById: string, task: NewTask): Promise<Task> {
    const { id } = await this.tx.task.create({
      data: {
        workspaceId,
        createdById,
        title: task.title,
        assigneeId: task.assigneeId,
        dueAt: new Date(task.dueAt),
        remindAt: toDate(task.remindAt),
        ...toLinkColumns(task.related),
      },
      select: { id: true },
    });
    // Unseen by other transactions until commit, so it needs no lock.
    const created = await findTask(this.tx, workspaceId, id);
    if (!created) {
      throw new Error(`Task ${id} not readable right after it was created`);
    }
    return created;
  }

  async update(workspaceId: string, id: string, write: TaskWrite): Promise<Task | null> {
    const { count } = await this.tx.task.updateMany({
      where: { id, ...visible(workspaceId) },
      data: toData(write),
    });
    // The update holds the row lock already.
    return count === 0 ? null : findTask(this.tx, workspaceId, id);
  }

  async findOwnership(workspaceId: string, id: string): Promise<TaskOwnership | null> {
    if (!(await lockTask(this.tx, workspaceId, id))) {
      return null;
    }
    const [row] = await this.tx.$queryRaw<OwnershipRow[]>`
      SELECT t.created_by_id, t.deleted_at IS NOT NULL AS is_deleted,
        NOT (${TASK_LINKS_VISIBLE}) AS is_hidden
      FROM tasks t
      ${TASK_LINK_JOINS}
      WHERE t.id = ${id}::uuid AND t.workspace_id = ${workspaceId}::uuid`;
    if (!row) {
      return null;
    }
    return { createdById: row.created_by_id, isDeleted: row.is_deleted, isHidden: row.is_hidden };
  }

  async softDelete(workspaceId: string, id: string): Promise<boolean> {
    const { count } = await this.tx.task.updateMany({
      where: { id, ...visible(workspaceId) },
      data: { deletedAt: new Date() },
    });
    return count > 0;
  }

  async restore(workspaceId: string, id: string): Promise<boolean> {
    const { count } = await this.tx.task.updateMany({
      where: { id, ...deletedButLinksVisible(workspaceId) },
      data: { deletedAt: null },
    });
    return count > 0;
  }
}
