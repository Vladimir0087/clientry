import { Injectable } from '@nestjs/common';

import { CURRENCIES, dealActivitySchema } from '@clientry/shared/deals';
import type { BoardColumn, CurrencyTotal, Deal, DealActivity } from '@clientry/shared/deals';

import { findDeal, loadBoardColumns, selectDeals, visible } from './deal-reads.repository.js';
import type {
  BoardFilter,
  DealPage,
  DealsRepository,
  DealsTransaction,
} from './deals.repository.js';
import { PrismaDealsTransaction } from './prisma-deals-transaction.repository.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  payload: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.ActivitySelect;

type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;

function toActivity(row: ActivityRow): DealActivity {
  const entry = { ...row, createdAt: row.createdAt.toISOString() };
  const result = dealActivitySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`Activity ${row.id} does not match dealActivitySchema`, {
      cause: result.error,
    });
  }
  return result.data;
}

function toPage<R, T>(rows: readonly R[], limit: number, map: (row: R) => T): DealPage<T> {
  return { items: rows.slice(0, limit).map(map), hasMore: rows.length > limit };
}

function sortTotals(totals: CurrencyTotal[]): CurrencyTotal[] {
  return totals.toSorted((a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency));
}

@Injectable()
export class PrismaDealsRepository implements DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(workspaceId: string, id: string): Promise<Deal | null> {
    return findDeal(this.prisma, workspaceId, id);
  }

  async isVisible(workspaceId: string, id: string): Promise<boolean> {
    const row = await this.prisma.deal.findFirst({
      where: { id, ...visible(workspaceId) },
      select: { id: true },
    });
    return row !== null;
  }

  // Two statements whatever the size of the board: the cards and the per-currency totals.
  async board(workspaceId: string, filter: BoardFilter): Promise<BoardColumn[]> {
    const [columns, groups] = await Promise.all([
      loadBoardColumns(this.prisma, workspaceId, filter),
      this.prisma.deal.groupBy({
        by: ['stageId', 'currency'],
        where: { ...visible(workspaceId), assigneeId: filter.assigneeId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);
    const totals = new Map<string, CurrencyTotal[]>();
    for (const group of groups) {
      const total = {
        currency: group.currency,
        amount: Number(group._sum.amount ?? 0),
        count: group._count._all,
      };
      totals.set(group.stageId, [...(totals.get(group.stageId) ?? []), total]);
    }
    return columns.map(({ stage, deals }) => {
      const stageTotals = sortTotals(totals.get(stage.id) ?? []);
      const count = stageTotals.reduce((sum, total) => sum + total.count, 0);
      return { stage, deals, count, totals: stageTotals };
    });
  }

  async listByClient(
    workspaceId: string,
    clientId: string,
    limit: number,
  ): Promise<DealPage<Deal>> {
    const deals = await selectDeals(
      this.prisma,
      workspaceId,
      Prisma.sql`d.client_id = ${clientId}::uuid`,
      Prisma.sql`ORDER BY d.created_at DESC, d.id DESC LIMIT ${limit + 1}`,
    );
    return toPage(deals, limit, (deal) => deal);
  }

  async history(
    workspaceId: string,
    dealId: string,
    limit: number,
  ): Promise<DealPage<DealActivity>> {
    const rows = await this.prisma.activity.findMany({
      where: { workspaceId, dealId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ACTIVITY_SELECT,
    });
    return toPage(rows, limit, toActivity);
  }

  inTransaction<T>(work: (deals: DealsTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaDealsTransaction(tx)));
  }
}
