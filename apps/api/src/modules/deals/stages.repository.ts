import type { DealEvent, Stage, StageListItem } from '@clientry/shared/deals';

export type DealMovedEvent = Extract<DealEvent, { type: 'deal_moved' }>;

export interface DealTransfer {
  readonly id: string;
  readonly position: string;
}

// Bound to a transaction that holds the workspace lock.
export interface LockedStagesRepository {
  // In board order.
  list(workspaceId: string): Promise<Stage[]>;
  listWithCounts(workspaceId: string): Promise<StageListItem[]>;
  create(workspaceId: string, name: string, position: number): Promise<Stage>;
  rename(workspaceId: string, id: string, name: string): Promise<Stage>;
  saveOrder(workspaceId: string, ids: readonly string[]): Promise<void>;
  // A deal written into the stage meanwhile waits for this lock and then fails its foreign key.
  lockStage(workspaceId: string, id: string): Promise<void>;
  // Every deal of the stage, deleted and hidden ones included, by position then id; the rows stay
  // locked until the transaction ends.
  listDealIds(workspaceId: string, stageId: string): Promise<string[]>;
  // Over every deal of the stage, deleted and hidden ones included.
  findLastPosition(workspaceId: string, stageId: string): Promise<string | null>;
  // Puts each deal in the target at its position with version + 1, and writes the event for each.
  transferDeals(
    workspaceId: string,
    actorId: string,
    targetStageId: string,
    transfers: readonly DealTransfer[],
    event: DealMovedEvent,
  ): Promise<void>;
  delete(workspaceId: string, id: string): Promise<void>;
}

export abstract class StagesRepository {
  // In board order, each with its number of visible deals.
  abstract listWithCounts(workspaceId: string): Promise<StageListItem[]>;
  abstract inWorkspaceLock<T>(
    workspaceId: string,
    work: (stages: LockedStagesRepository) => Promise<T>,
  ): Promise<T>;
}
