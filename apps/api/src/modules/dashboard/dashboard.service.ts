import { Injectable } from '@nestjs/common';

import type {
  ClosedDeals,
  ClosedDealsPeriod,
  ClosedDealsQuery,
  DashboardSummary,
  DealTotals,
  MemberWorkload,
} from '@clientry/shared/dashboard';
import { CURRENCIES } from '@clientry/shared/deals';
import type { Currency, CurrencyTotal } from '@clientry/shared/deals';

import { DashboardRepository } from './dashboard.repository.js';
import type {
  AssigneeTasksRow,
  ClosedDealsRow,
  CurrencyAmount,
  MemberRef,
  SummaryRows,
} from './dashboard.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';

// Amounts add up only within one currency.
function toDealTotals(amounts: readonly CurrencyAmount[]): DealTotals {
  const byCurrency = new Map<Currency, CurrencyTotal>();
  for (const { currency, count, amount } of amounts) {
    const total = byCurrency.get(currency) ?? { currency, count: 0, amount: 0 };
    byCurrency.set(currency, {
      currency,
      count: total.count + count,
      amount: total.amount + amount,
    });
  }
  const totals = [...byCurrency.values()].toSorted(
    (a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
  );
  return { count: totals.reduce((sum, total) => sum + total.count, 0), totals };
}

function toWorkload(rows: SummaryRows, member: MemberRef): MemberWorkload {
  const deals = rows.deals.filter(({ assigneeId }) => assigneeId === member.id);
  const tasks = rows.tasks.find(({ assigneeId }) => assigneeId === member.id);
  return {
    member: { id: member.id, name: member.name },
    openDeals: toDealTotals(deals),
    openTasks: tasks?.open ?? 0,
    overdueTasks: tasks?.overdue ?? 0,
  };
}

function sumTasks(rows: readonly AssigneeTasksRow[]): DashboardSummary['tasks'] {
  return {
    open: rows.reduce((sum, row) => sum + row.open, 0),
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
  };
}

function toPeriod(
  rows: readonly ClosedDealsRow[],
  index: number,
  start: string,
  end: string,
): ClosedDealsPeriod {
  const inPeriod = rows.filter(({ period }) => period === index);
  return {
    start,
    end,
    won: toDealTotals(inPeriod.filter(({ kind }) => kind === 'won')),
    lost: toDealTotals(inPeriod.filter(({ kind }) => kind === 'lost')),
  };
}

// Every member reads the numbers of the whole workspace.
@Injectable()
export class DashboardService {
  constructor(private readonly dashboard: DashboardRepository) {}

  // The tile, the pipeline and the team table come from one snapshot, and openDeals is summed
  // from the stage rows, so they always agree.
  async summary(user: AuthUser): Promise<DashboardSummary> {
    const rows = await this.dashboard.summary(user.workspaceId);
    return {
      openDeals: toDealTotals(rows.stages.flatMap(({ totals }) => totals)),
      stages: rows.stages.map(({ stage, totals }) => ({ stage, ...toDealTotals(totals) })),
      tasks: sumTasks(rows.tasks),
      members: rows.members.map((member) => toWorkload(rows, member)),
    };
  }

  // One period per pair of neighbouring bounds.
  async closedDeals(user: AuthUser, { bounds }: ClosedDealsQuery): Promise<ClosedDeals> {
    const rows = await this.dashboard.closedDeals(user.workspaceId, bounds);
    const periods = bounds.slice(1).flatMap((end, index) => {
      const start = bounds[index];
      return start === undefined ? [] : [toPeriod(rows, index, start, end)];
    });
    return { periods };
  }
}
