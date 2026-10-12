import { Injectable, Logger } from '@nestjs/common';

import { STAGE_LIMITS } from '@clientry/shared/deals';
import type {
  CreateStageRequest,
  DeleteStageQuery,
  RenameStageRequest,
  ReorderStagesRequest,
  Stage,
  StageListResponse,
} from '@clientry/shared/deals';

import { positionsAfter } from './deal-position.js';
import {
  LastOpenStageError,
  StageLimitReachedError,
  StageNameTakenError,
  StageNotDeletableError,
  StageNotFoundError,
  StagesChangedError,
} from './errors.js';
import { StagesRepository } from './stages.repository.js';
import type { DealTransfer, LockedStagesRepository } from './stages.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

function openStages(stages: readonly Stage[]): Stage[] {
  return stages.filter(({ kind }) => kind === 'open');
}

// Open stages in the given order, then won, then lost.
function boardOrder(open: readonly Stage[], stages: readonly Stage[]): string[] {
  const closed = (kind: Stage['kind']): Stage[] => stages.filter((stage) => stage.kind === kind);
  return [...open, ...closed('won'), ...closed('lost')].map(({ id }) => id);
}

// Renaming a stage to its own name in another case is allowed.
function assertNameFree(stages: readonly Stage[], name: string, exceptId: string | null): void {
  const key = name.toLowerCase();
  if (stages.some((stage) => stage.id !== exceptId && stage.name.toLowerCase() === key)) {
    throw new StageNameTakenError();
  }
}

function requireStage(stages: readonly Stage[], id: string): Stage {
  const stage = stages.find((candidate) => candidate.id === id);
  if (!stage) {
    throw new StageNotFoundError();
  }
  return stage;
}

interface StageDeletion {
  readonly stage: Stage;
  readonly target: Stage;
}

function checkDeletion(stages: readonly Stage[], id: string, moveDealsTo: string): StageDeletion {
  const stage = requireStage(stages, id);
  if (stage.kind !== 'open') {
    throw new StageNotDeletableError();
  }
  const open = openStages(stages);
  if (open.length === 1) {
    throw new LastOpenStageError();
  }
  const target = open.find((candidate) => candidate.id === moveDealsTo && candidate.id !== id);
  if (!target) {
    throw new RequestValidationError([
      { path: 'moveDealsTo', message: 'Choose another open stage' },
    ]);
  }
  return { stage, target };
}

function toTransfers(dealIds: readonly string[], positions: readonly string[]): DealTransfer[] {
  return dealIds.map((id, index) => {
    const position = positions[index];
    if (position === undefined) {
      throw new Error(
        `No position for deal ${id}: ${String(positions.length)} keys for ${String(dealIds.length)} deals`,
      );
    }
    return { id, position };
  });
}

// Every write runs under the workspace lock, so two owners editing at once cannot break a rule.
@Injectable()
export class StagesService {
  private readonly logger = new Logger(StagesService.name);

  constructor(private readonly stages: StagesRepository) {}

  async list(user: AuthUser): Promise<StageListResponse> {
    return { items: await this.stages.listWithCounts(user.workspaceId) };
  }

  async create(user: AuthUser, { name }: CreateStageRequest): Promise<Stage> {
    const { workspaceId } = user;
    const stage = await this.stages.inWorkspaceLock(workspaceId, async (locked) => {
      const stages = await locked.list(workspaceId);
      const open = openStages(stages);
      if (open.length >= STAGE_LIMITS.openStages) {
        throw new StageLimitReachedError();
      }
      assertNameFree(stages, name, null);
      const created = await locked.create(workspaceId, name, open.length);
      await locked.saveOrder(workspaceId, boardOrder([...open, created], stages));
      return created;
    });
    this.logger.log(this.logContext(user, stage.id), 'Stage created');
    return stage;
  }

  async rename(user: AuthUser, id: string, { name }: RenameStageRequest): Promise<Stage> {
    const { workspaceId } = user;
    const stage = await this.stages.inWorkspaceLock(workspaceId, async (locked) => {
      const stages = await locked.list(workspaceId);
      requireStage(stages, id);
      assertNameFree(stages, name, id);
      const renamed = await locked.rename(workspaceId, id, name);
      await locked.saveOrder(workspaceId, boardOrder(openStages(stages), stages));
      return renamed;
    });
    this.logger.log(this.logContext(user, stage.id), 'Stage renamed');
    return stage;
  }

  // The list must be exactly the current open stages, or a concurrent change is overwritten.
  async reorder(user: AuthUser, { ids }: ReorderStagesRequest): Promise<StageListResponse> {
    const { workspaceId } = user;
    const items = await this.stages.inWorkspaceLock(workspaceId, async (locked) => {
      const stages = await locked.list(workspaceId);
      const open = openStages(stages);
      const isCurrent = ids.length === open.length && open.every((stage) => ids.includes(stage.id));
      if (!isCurrent) {
        throw new StagesChangedError();
      }
      const ordered = ids.map((id) => requireStage(open, id));
      await locked.saveOrder(workspaceId, boardOrder(ordered, stages));
      return locked.listWithCounts(workspaceId);
    });
    this.logger.log({ workspaceId, userId: user.id }, 'Stages reordered');
    return { items };
  }

  async delete(user: AuthUser, id: string, { moveDealsTo }: DeleteStageQuery): Promise<void> {
    const { workspaceId } = user;
    const movedDeals = await this.stages.inWorkspaceLock(workspaceId, async (locked) => {
      const stages = await locked.list(workspaceId);
      const { stage, target } = checkDeletion(stages, id, moveDealsTo);
      await locked.lockStage(workspaceId, id);
      const moved = await this.moveDeals(locked, user, stage, target);
      await locked.delete(workspaceId, id);
      const remaining = openStages(stages).filter((candidate) => candidate.id !== id);
      await locked.saveOrder(workspaceId, boardOrder(remaining, stages));
      return moved;
    });
    this.logger.log(
      { ...this.logContext(user, id), targetStageId: moveDealsTo, movedDeals },
      'Stage deleted',
    );
  }

  // Every deal of the stage, deleted and hidden ones included, goes to the end of the target in
  // its order, so a restored deal still has a column.
  private async moveDeals(
    locked: LockedStagesRepository,
    user: AuthUser,
    stage: Stage,
    target: Stage,
  ): Promise<number> {
    const { workspaceId } = user;
    const dealIds = await locked.listDealIds(workspaceId, stage.id);
    const last = await locked.findLastPosition(workspaceId, target.id);
    const transfers = toTransfers(dealIds, positionsAfter(last, dealIds.length));
    await locked.transferDeals(workspaceId, user.id, target.id, transfers, {
      type: 'deal_moved',
      payload: { from: stage, to: target, reason: 'stage_deleted' },
    });
    return transfers.length;
  }

  private logContext(user: AuthUser, stageId: string): Record<string, string> {
    return { stageId, workspaceId: user.workspaceId, userId: user.id };
  }
}
