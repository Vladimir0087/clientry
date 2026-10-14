import type { Currency, Stage } from '@clientry/shared/deals';

export interface CurrencyAmount {
  readonly currency: Currency;
  readonly count: number;
  readonly amount: number;
}

// An open stage with one row per currency of its visible open deals; an empty stage has none.
export interface PipelineStageRows {
  readonly stage: Stage;
  readonly totals: readonly CurrencyAmount[];
}

export interface AssigneeDealsRow extends CurrencyAmount {
  readonly assigneeId: string;
}

export interface AssigneeTasksRow {
  readonly assigneeId: string;
  readonly open: number;
  readonly overdue: number;
}

export interface MemberRef {
  readonly id: string;
  readonly name: string;
}

// Read in one snapshot, so the parts agree with each other.
export interface SummaryRows {
  // Every open stage in board order.
  readonly stages: readonly PipelineStageRows[];
  readonly deals: readonly AssigneeDealsRow[];
  readonly tasks: readonly AssigneeTasksRow[];
  // Every current member in join order.
  readonly members: readonly MemberRef[];
}

export interface ClosedDealsRow extends CurrencyAmount {
  // 0 for the period between the first two bounds.
  readonly period: number;
  readonly kind: 'won' | 'lost';
}

export abstract class DashboardRepository {
  abstract summary(workspaceId: string): Promise<SummaryRows>;
  // Visible deals of won and lost stages closed in [first bound, last bound), grouped by the
  // period that holds closed_at, the stage kind and the currency.
  abstract closedDeals(workspaceId: string, bounds: readonly string[]): Promise<ClosedDealsRow[]>;
}
