import type {
  BoardColumn,
  Currency,
  Deal,
  DealActivity,
  DealEvent,
  DealRef,
  Stage,
} from '@clientry/shared/deals';

import type { DealEdit } from './deal-changes.js';

export interface NewDeal {
  readonly title: string;
  readonly clientId: string;
  readonly stageId: string;
  readonly amount: number;
  readonly currency: Currency;
  readonly assigneeId: string;
  readonly position: string;
  readonly closedAt: Date | null;
}

export interface DealPlacement {
  readonly stageId: string;
  readonly position: string;
  readonly closedAt: Date | null;
}

export interface DealOwnership {
  readonly createdById: string;
  readonly isDeleted: boolean;
  readonly isClientDeleted: boolean;
}

export interface BoardFilter {
  readonly assigneeId?: string;
}

export interface DealPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}

// A deal is visible when neither it nor its client is deleted; every read here returns only
// visible deals, except findOwnership and the neighbour lookups of a move.
export interface DealsTransaction {
  findById(workspaceId: string, id: string): Promise<Deal | null>;
  // The reference checks: an active client, a stage and a member of the workspace.
  findClient(workspaceId: string, clientId: string): Promise<DealRef | null>;
  findStage(workspaceId: string, stageId: string): Promise<Stage | null>;
  findMember(workspaceId: string, userId: string): Promise<DealRef | null>;
  // The position of a visible deal of the stage; null when it is not on that column.
  findBoardPosition(workspaceId: string, stageId: string, dealId: string): Promise<string | null>;
  // The first position strictly greater than after (the first of all when null), over every
  // deal of the stage but excludeId, deleted and hidden ones included.
  findNextPosition(
    workspaceId: string,
    stageId: string,
    after: string | null,
    excludeId: string | null,
  ): Promise<string | null>;
  // Throws RequestValidationError on stageId when the stage was deleted meanwhile.
  create(workspaceId: string, createdById: string, deal: NewDeal): Promise<Deal>;
  // Conditional on the version; null when no visible deal with that version matched.
  update(workspaceId: string, id: string, version: number, edit: DealEdit): Promise<Deal | null>;
  // As update; throws BoardChangedError when the stage was deleted meanwhile.
  move(
    workspaceId: string,
    id: string,
    version: number,
    placement: DealPlacement,
  ): Promise<Deal | null>;
  findOwnership(workspaceId: string, id: string): Promise<DealOwnership | null>;
  // False when no active deal of an active client matched.
  softDelete(workspaceId: string, id: string): Promise<boolean>;
  // False when the deal was not deleted or its client is.
  restore(workspaceId: string, id: string): Promise<boolean>;
  addActivity(
    workspaceId: string,
    dealId: string,
    actorId: string,
    event: DealEvent,
  ): Promise<void>;
}

export abstract class DealsRepository {
  abstract findById(workspaceId: string, id: string): Promise<Deal | null>;
  abstract isVisible(workspaceId: string, id: string): Promise<boolean>;
  abstract board(workspaceId: string, filter: BoardFilter): Promise<BoardColumn[]>;
  abstract listByClient(
    workspaceId: string,
    clientId: string,
    limit: number,
  ): Promise<DealPage<Deal>>;
  // Newest first; throws when a stored entry does not match dealActivitySchema.
  abstract history(
    workspaceId: string,
    dealId: string,
    limit: number,
  ): Promise<DealPage<DealActivity>>;
  abstract inTransaction<T>(work: (deals: DealsTransaction) => Promise<T>): Promise<T>;
}
