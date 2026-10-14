import { DEAL_LIMITS } from '@clientry/shared/deals';
import type {
  BoardColumn,
  Currency,
  Deal,
  DealCard,
  Stage,
  StageKind,
} from '@clientry/shared/deals';

import type { BoardFilter } from './deals.repository.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { dealClientJoin, dealVisible } from '../../infra/prisma/visibility.js';

// Raw SQL with joins rather than Prisma relation selects: Prisma loads sibling relations with
// concurrent queries, which overlap on a transaction's one connection, and pg deprecates that.

const DEAL = { deal: 'd', client: 'c' } as const;

interface DealRow {
  readonly id: string;
  readonly title: string;
  readonly amount: bigint;
  readonly currency: Currency;
  readonly closed_at: Date | null;
  readonly version: number;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly stage_id: string;
  readonly stage_name: string;
  readonly stage_kind: StageKind;
  readonly client_id: string;
  readonly client_name: string;
  readonly assignee_id: string;
  readonly assignee_name: string;
  readonly created_by_id: string;
  readonly created_by_name: string;
}

// Amounts stay far below 2^53, so the bigint converts to a number exactly.
function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    currency: row.currency,
    stage: { id: row.stage_id, name: row.stage_name, kind: row.stage_kind },
    client: { id: row.client_id, name: row.client_name },
    assignee: { id: row.assignee_id, name: row.assignee_name },
    createdBy: { id: row.created_by_id, name: row.created_by_name },
    closedAt: row.closed_at?.toISOString() ?? null,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function selectDeals(
  db: Prisma.TransactionClient,
  workspaceId: string,
  condition: Prisma.Sql,
  order: Prisma.Sql = Prisma.empty,
): Promise<Deal[]> {
  const rows = await db.$queryRaw<DealRow[]>`
    SELECT d.id, d.title, d.amount, d.currency, d.closed_at, d.version, d.created_at,
      d.updated_at, s.id AS stage_id, s.name AS stage_name, s.kind AS stage_kind,
      c.id AS client_id, c.name AS client_name, a.id AS assignee_id, a.name AS assignee_name,
      cb.id AS created_by_id, cb.name AS created_by_name
    FROM deals d
    JOIN stages s ON s.id = d.stage_id
    ${dealClientJoin(DEAL)}
    JOIN users a ON a.id = d.assignee_id
    JOIN users cb ON cb.id = d.created_by_id
    WHERE d.workspace_id = ${workspaceId}::uuid AND ${dealVisible(DEAL)} AND ${condition}
    ${order}`;
  return rows.map(toDeal);
}

export async function findDeal(
  db: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
): Promise<Deal | null> {
  const [deal] = await selectDeals(db, workspaceId, Prisma.sql`d.id = ${id}::uuid`);
  return deal ?? null;
}

interface BoardStageRow {
  readonly stage_id: string;
  readonly stage_name: string;
  readonly stage_kind: StageKind;
}

interface BoardCardRow {
  readonly id: string;
  readonly title: string;
  readonly amount: bigint;
  readonly currency: Currency;
  readonly closed_at: Date | null;
  readonly version: number;
  readonly client_id: string;
  readonly client_name: string;
  readonly assignee_id: string;
  readonly assignee_name: string;
}

// The LEFT JOIN fills every card column or none: an empty stage comes back as one row of nulls.
type BoardRow = BoardStageRow & (BoardCardRow | { readonly [K in keyof BoardCardRow]: null });

export type ColumnCards = Pick<BoardColumn, 'stage' | 'deals'>;

function toCard(row: BoardCardRow): DealCard {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    currency: row.currency,
    client: { id: row.client_id, name: row.client_name },
    assignee: { id: row.assignee_id, name: row.assignee_name },
    closedAt: row.closed_at?.toISOString() ?? null,
    version: row.version,
  };
}

function groupColumns(rows: readonly BoardRow[]): ColumnCards[] {
  const columns = new Map<string, { stage: Stage; deals: DealCard[] }>();
  for (const row of rows) {
    const stage: Stage = { id: row.stage_id, name: row.stage_name, kind: row.stage_kind };
    const column = columns.get(stage.id) ?? { stage, deals: [] };
    columns.set(stage.id, column);
    if (row.id !== null) {
      column.deals.push(toCard(row));
    }
  }
  return [...columns.values()];
}

// The first cards of the outer query's stage s, numbered in column order.
function columnCards(
  workspaceId: string,
  { assigneeId }: BoardFilter,
  order: Prisma.Sql,
  kind: Prisma.Sql,
): Prisma.Sql {
  const assignee =
    assigneeId === undefined ? Prisma.empty : Prisma.sql`AND d.assignee_id = ${assigneeId}::uuid`;
  return Prisma.sql`
    SELECT d.id, d.title, d.amount, d.currency, d.closed_at, d.version,
      c.id AS client_id, c.name AS client_name, u.id AS assignee_id, u.name AS assignee_name,
      row_number() OVER (ORDER BY ${order}) AS card_rank
    FROM deals d
    ${dealClientJoin(DEAL)}
    JOIN users u ON u.id = d.assignee_id
    WHERE ${kind} AND d.workspace_id = ${workspaceId}::uuid AND d.stage_id = s.id
      AND ${dealVisible(DEAL)} ${assignee}
    ORDER BY ${order}
    LIMIT ${DEAL_LIMITS.boardColumn}`;
}

// Open columns follow the position index, closed ones the closed_at index read backwards; only the
// branch matching the stage kind runs. Bound parameters only.
export async function loadBoardColumns(
  db: Prisma.TransactionClient,
  workspaceId: string,
  filter: BoardFilter,
): Promise<ColumnCards[]> {
  const cards = (order: Prisma.Sql, kind: Prisma.Sql): Prisma.Sql =>
    columnCards(workspaceId, filter, order, kind);
  const rows = await db.$queryRaw<BoardRow[]>`
    SELECT s.id AS stage_id, s.name AS stage_name, s.kind AS stage_kind, d.*
    FROM stages s
    LEFT JOIN LATERAL (
      (${cards(Prisma.sql`d.position, d.id`, Prisma.sql`s.kind = 'open'`)})
      UNION ALL
      (${cards(Prisma.sql`d.closed_at DESC, d.id DESC`, Prisma.sql`s.kind <> 'open'`)})
    ) d ON true
    WHERE s.workspace_id = ${workspaceId}::uuid
    ORDER BY s.position, s.id, d.card_rank`;
  return groupColumns(rows);
}
