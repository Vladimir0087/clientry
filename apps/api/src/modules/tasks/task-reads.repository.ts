import type { Task, TaskRelated } from '@clientry/shared/tasks';

import type { TaskCursor } from './task-cursor.js';
import type { TaskListFilter } from './tasks.repository.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { taskLinkJoins, taskLinksVisible } from '../../infra/prisma/visibility.js';

// Raw SQL with joins rather than Prisma relation selects: Prisma loads sibling relations with
// concurrent queries, which overlap on a transaction's one connection, and pg deprecates that.

const TASK = { task: 't', client: 'c', deal: 'd', dealClient: 'dc' } as const;

interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly due_at: Date;
  readonly remind_at: Date | null;
  readonly reminder_sent_at: Date | null;
  readonly done_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly assignee_id: string;
  readonly assignee_name: string;
  readonly created_by_id: string;
  readonly created_by_name: string;
  readonly client_id: string | null;
  readonly client_name: string | null;
  readonly deal_id: string | null;
  readonly deal_title: string | null;
  readonly deal_client_id: string | null;
  readonly deal_client_name: string | null;
}

function toRelated(row: TaskRow): TaskRelated | null {
  const { deal_id, deal_title, deal_client_id, deal_client_name } = row;
  if (
    deal_id !== null &&
    deal_title !== null &&
    deal_client_id !== null &&
    deal_client_name !== null
  ) {
    const client = { id: deal_client_id, name: deal_client_name };
    return { kind: 'deal', id: deal_id, title: deal_title, client };
  }
  if (row.client_id !== null && row.client_name !== null) {
    return { kind: 'client', id: row.client_id, name: row.client_name };
  }
  return null;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at.toISOString(),
    remindAt: row.remind_at?.toISOString() ?? null,
    reminderSentAt: row.reminder_sent_at?.toISOString() ?? null,
    doneAt: row.done_at?.toISOString() ?? null,
    assignee: { id: row.assignee_id, name: row.assignee_name },
    createdBy: { id: row.created_by_id, name: row.created_by_name },
    related: toRelated(row),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function selectTasks(
  db: Prisma.TransactionClient,
  workspaceId: string,
  condition: Prisma.Sql,
  suffix: Prisma.Sql = Prisma.empty,
): Promise<Task[]> {
  const rows = await db.$queryRaw<TaskRow[]>`
    SELECT t.id, t.title, t.due_at, t.remind_at, t.reminder_sent_at, t.done_at, t.created_at,
      t.updated_at, a.id AS assignee_id, a.name AS assignee_name, cb.id AS created_by_id,
      cb.name AS created_by_name, c.id AS client_id, c.name AS client_name, d.id AS deal_id,
      d.title AS deal_title, dc.id AS deal_client_id, dc.name AS deal_client_name
    FROM tasks t
    JOIN users a ON a.id = t.assignee_id
    JOIN users cb ON cb.id = t.created_by_id
    ${taskLinkJoins(TASK)}
    WHERE t.workspace_id = ${workspaceId}::uuid AND t.deleted_at IS NULL
      AND ${taskLinksVisible(TASK)}
      AND ${condition}
    ${suffix}`;
  return rows.map(toTask);
}

export async function findTask(
  db: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
): Promise<Task | null> {
  const [task] = await selectTasks(db, workspaceId, Prisma.sql`t.id = ${id}::uuid`);
  return task ?? null;
}

// A statement of its own: a locking read over joins rechecks a row changed meanwhile against the
// joined rows it saw first, and drops a task whose assignee or link changed. False when absent.
export async function lockTask(
  db: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<unknown[]>`
    SELECT 1 FROM tasks WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
    FOR UPDATE`;
  return rows.length > 0;
}

// The read after the lock is a new statement, so it sees every change committed before the lock.
export async function findLockedTask(
  db: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
): Promise<Task | null> {
  return (await lockTask(db, workspaceId, id)) ? findTask(db, workspaceId, id) : null;
}

function filterConditions(workspaceId: string, filter: TaskListFilter): Prisma.Sql[] {
  const conditions = [
    filter.status === 'open' ? Prisma.sql`t.done_at IS NULL` : Prisma.sql`t.done_at IS NOT NULL`,
  ];
  if (filter.assigneeId !== undefined) {
    conditions.push(Prisma.sql`t.assignee_id = ${filter.assigneeId}::uuid`);
  }
  // An array rather than IN: an IN subquery under OR becomes a filter over every task, while an
  // array lets both sides of the OR use the client and deal indexes.
  if (filter.clientId !== undefined) {
    conditions.push(Prisma.sql`(t.client_id = ${filter.clientId}::uuid
      OR t.deal_id = ANY (ARRAY(SELECT id FROM deals
        WHERE workspace_id = ${workspaceId}::uuid AND client_id = ${filter.clientId}::uuid)))`);
  }
  if (filter.dealId !== undefined) {
    conditions.push(Prisma.sql`t.deal_id = ${filter.dealId}::uuid`);
  }
  return conditions;
}

// Postgres cannot seek an index by the OR alone; the redundant bound starts the scan at the cursor.
function afterCursor(cursor: TaskCursor): Prisma.Sql {
  const dueAt = new Date(cursor.dueAt);
  if (cursor.status === 'open') {
    return Prisma.sql`t.due_at >= ${dueAt} AND (t.due_at > ${dueAt}
      OR (t.due_at = ${dueAt} AND t.id > ${cursor.id}::uuid))`;
  }
  const doneAt = new Date(cursor.doneAt);
  return Prisma.sql`t.done_at <= ${doneAt} AND (t.done_at < ${doneAt}
    OR (t.done_at = ${doneAt} AND (t.due_at < ${dueAt}
      OR (t.due_at = ${dueAt} AND t.id < ${cursor.id}::uuid))))`;
}

// The (done_at, due_at, id) index order, backwards for done lists. done_at leads even when NULL:
// Postgres does not treat IS NULL as fixing the column and would sort every open task.
const ORDERS = {
  open: Prisma.sql`ORDER BY t.done_at, t.due_at, t.id`,
  done: Prisma.sql`ORDER BY t.done_at DESC, t.due_at DESC, t.id DESC`,
} as const;

export function listTasks(
  db: Prisma.TransactionClient,
  workspaceId: string,
  filter: TaskListFilter,
  after: TaskCursor | null,
  take: number,
): Promise<Task[]> {
  const conditions = filterConditions(workspaceId, filter);
  if (after !== null) {
    conditions.push(afterCursor(after));
  }
  return selectTasks(
    db,
    workspaceId,
    Prisma.join(conditions, ' AND '),
    Prisma.sql`${ORDERS[filter.status]} LIMIT ${take}`,
  );
}
