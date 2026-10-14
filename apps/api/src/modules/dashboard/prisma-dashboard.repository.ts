import { Injectable } from '@nestjs/common';

import type { Currency, Stage, StageKind } from '@clientry/shared/deals';

import type {
  AssigneeDealsRow,
  AssigneeTasksRow,
  ClosedDealsRow,
  CurrencyAmount,
  DashboardRepository,
  MemberRef,
  PipelineStageRows,
  SummaryRows,
} from './dashboard.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { inSnapshot } from '../../infra/prisma/snapshot.js';
import {
  dealClientJoin,
  dealVisible,
  taskLinkJoins,
  taskLinksVisible,
} from '../../infra/prisma/visibility.js';

const DEAL = { deal: 'd', client: 'c' } as const;
const TASK = { task: 't', client: 'c', deal: 'd', dealClient: 'dc' } as const;

interface AmountColumns {
  readonly currency: Currency;
  readonly count: number;
  readonly amount: bigint;
}

// The LEFT JOIN gives an empty stage one row without a currency.
interface StageRow {
  readonly id: string;
  readonly name: string;
  readonly kind: StageKind;
  readonly currency: Currency | null;
  readonly count: number;
  readonly amount: bigint | null;
}

interface DealsRow extends AmountColumns {
  readonly assignee_id: string;
}

interface TasksRow {
  readonly assignee_id: string;
  readonly open: number;
  readonly overdue: number;
}

interface ClosedRow extends AmountColumns {
  readonly bucket: number;
  readonly kind: 'won' | 'lost';
}

// Sums stay far below 2^53, so the bigint converts to a number exactly.
function toAmount({ currency, count, amount }: AmountColumns): CurrencyAmount {
  return { currency, count, amount: Number(amount) };
}

function groupStages(rows: readonly StageRow[]): PipelineStageRows[] {
  const stages = new Map<string, { stage: Stage; totals: CurrencyAmount[] }>();
  for (const row of rows) {
    const stage: Stage = { id: row.id, name: row.name, kind: row.kind };
    const entry = stages.get(stage.id) ?? { stage, totals: [] };
    stages.set(stage.id, entry);
    if (row.currency !== null && row.amount !== null) {
      entry.totals.push(toAmount({ currency: row.currency, count: row.count, amount: row.amount }));
    }
  }
  return [...stages.values()];
}

// sum() of bigint gives numeric, cast back so the driver returns a bigint; counts are cast to int.
function openStages(tx: Prisma.TransactionClient, workspaceId: string): Promise<StageRow[]> {
  return tx.$queryRaw<StageRow[]>`
    SELECT s.id, s.name, s.kind, d.currency, count(d.id)::int AS count,
      sum(d.amount)::bigint AS amount
    FROM stages s
    LEFT JOIN (deals d ${dealClientJoin(DEAL)})
      ON d.workspace_id = s.workspace_id AND d.stage_id = s.id AND d.closed_at IS NULL
        AND ${dealVisible(DEAL)}
    WHERE s.workspace_id = ${workspaceId}::uuid AND s.kind = 'open'
    GROUP BY s.id, d.currency
    ORDER BY s.position, s.id, d.currency`;
}

function openDealsByAssignee(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<DealsRow[]> {
  return tx.$queryRaw<DealsRow[]>`
    SELECT d.assignee_id, d.currency, count(*)::int AS count, sum(d.amount)::bigint AS amount
    FROM deals d
    ${dealClientJoin(DEAL)}
    WHERE d.workspace_id = ${workspaceId}::uuid AND d.closed_at IS NULL AND ${dealVisible(DEAL)}
    GROUP BY d.assignee_id, d.currency`;
}

// now() is the transaction's start, an instant, so overdue needs no time zone.
function openTasksByAssignee(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<TasksRow[]> {
  return tx.$queryRaw<TasksRow[]>`
    SELECT t.assignee_id, count(*)::int AS open,
      (count(*) FILTER (WHERE t.due_at < now()))::int AS overdue
    FROM tasks t
    ${taskLinkJoins(TASK)}
    WHERE t.workspace_id = ${workspaceId}::uuid AND t.done_at IS NULL AND t.deleted_at IS NULL
      AND ${taskLinksVisible(TASK)}
    GROUP BY t.assignee_id`;
}

function members(tx: Prisma.TransactionClient, workspaceId: string): Promise<MemberRef[]> {
  return tx.$queryRaw<MemberRef[]>`
    SELECT u.id, u.name
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId}::uuid
    ORDER BY m.created_at, m.id`;
}

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Four statements whatever the data, one after another: concurrent queries on a transaction's
  // one connection are deprecated by pg.
  summary(workspaceId: string): Promise<SummaryRows> {
    return inSnapshot(this.prisma, async (tx) => {
      const stageRows = await openStages(tx, workspaceId);
      const dealRows = await openDealsByAssignee(tx, workspaceId);
      const taskRows = await openTasksByAssignee(tx, workspaceId);
      const memberRows = await members(tx, workspaceId);
      return {
        stages: groupStages(stageRows),
        deals: dealRows.map((row): AssigneeDealsRow => ({
          assigneeId: row.assignee_id,
          ...toAmount(row),
        })),
        tasks: taskRows.map((row): AssigneeTasksRow => ({
          assigneeId: row.assignee_id,
          open: row.open,
          overdue: row.overdue,
        })),
        members: memberRows,
      };
    });
  }

  // Bounds go in as ISO strings cast in SQL, so no Date passes through the driver adapter.
  async closedDeals(workspaceId: string, bounds: readonly string[]): Promise<ClosedDealsRow[]> {
    const first = bounds.at(0);
    const last = bounds.at(-1);
    if (first === undefined || last === undefined) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<ClosedRow[]>`
      SELECT width_bucket(d.closed_at, ${[...bounds]}::timestamptz[]) AS bucket, s.kind,
        d.currency, count(*)::int AS count, sum(d.amount)::bigint AS amount
      FROM stages s
      JOIN deals d ON d.workspace_id = s.workspace_id AND d.stage_id = s.id
      ${dealClientJoin(DEAL)}
      WHERE s.workspace_id = ${workspaceId}::uuid AND s.kind <> 'open'
        AND d.closed_at >= ${first}::timestamptz AND d.closed_at < ${last}::timestamptz
        AND ${dealVisible(DEAL)}
      GROUP BY bucket, s.kind, d.currency`;
    return rows.map((row) => ({ period: row.bucket - 1, kind: row.kind, ...toAmount(row) }));
  }
}
