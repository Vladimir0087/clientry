import { Injectable, Logger } from '@nestjs/common';

import type { Board, BoardQuery, Deal, MoveDealRequest, Stage } from '@clientry/shared/deals';

import { positionBetween } from './deal-position.js';
import { DealsRepository } from './deals.repository.js';
import type { DealPlacement, DealsTransaction } from './deals.repository.js';
import { BoardChangedError, DealChangedError, DealNotFoundError } from './errors.js';
import { staleDealError } from './stale-deal.js';
import type { AuthUser } from '../../common/auth/auth-user.js';

// Entering won or lost closes the deal now; staying in the same closed stage keeps the date.
function closedAtFor(deal: Deal, target: Stage): Date | null {
  if (target.kind === 'open') {
    return null;
  }
  if (deal.stage.id === target.id && deal.closedAt !== null) {
    return new Date(deal.closedAt);
  }
  return new Date();
}

@Injectable()
export class DealMovesService {
  private readonly logger = new Logger(DealMovesService.name);

  constructor(private readonly deals: DealsRepository) {}

  // "Mine" means assigned to the caller, not created by them.
  async board(user: AuthUser, query: BoardQuery): Promise<Board> {
    const assigneeId = query.assignee === 'me' ? user.id : undefined;
    return { columns: await this.deals.board(user.workspaceId, { assigneeId }) };
  }

  async move(user: AuthUser, id: string, input: MoveDealRequest): Promise<Deal> {
    const { workspaceId } = user;
    const { deal, fromStageId } = await this.deals.inTransaction(async (deals) => {
      const current = await deals.findById(workspaceId, id);
      if (!current) {
        throw new DealNotFoundError();
      }
      const placement = await this.placementFor(deals, workspaceId, current, input);
      const moved = await deals.move(workspaceId, id, input.version, placement);
      if (!moved) {
        throw await staleDealError(deals, workspaceId, id);
      }
      if (current.stage.id !== moved.stage.id) {
        await deals.addActivity(workspaceId, id, user.id, {
          type: 'deal_moved',
          payload: { from: current.stage, to: moved.stage },
        });
      }
      return { deal: moved, fromStageId: current.stage.id };
    });
    const context = { dealId: id, workspaceId, userId: user.id };
    this.logger.log({ ...context, fromStageId, toStageId: deal.stage.id }, 'Deal moved');
    return deal;
  }

  // The board is checked before the version, so a stale target answers BOARD_CHANGED.
  private async placementFor(
    deals: DealsTransaction,
    workspaceId: string,
    current: Deal,
    { version, stageId, afterId }: MoveDealRequest,
  ): Promise<DealPlacement> {
    const target = await deals.findStage(workspaceId, stageId);
    if (!target) {
      throw new BoardChangedError();
    }
    const after = await this.lowerNeighbour(deals, workspaceId, current.id, target, afterId);
    if (current.version !== version) {
      throw new DealChangedError();
    }
    const next = await deals.findNextPosition(workspaceId, target.id, after, current.id);
    return {
      stageId: target.id,
      position: positionBetween(after, next),
      closedAt: closedAtFor(current, target),
    };
  }

  // The position the card goes right after, or null for the top. Closed columns sort by close
  // date, so there afterId is ignored.
  private async lowerNeighbour(
    deals: DealsTransaction,
    workspaceId: string,
    dealId: string,
    target: Stage,
    afterId: string | null,
  ): Promise<string | null> {
    if (target.kind !== 'open' || afterId === null) {
      return null;
    }
    if (afterId === dealId) {
      throw new BoardChangedError();
    }
    const position = await deals.findBoardPosition(workspaceId, target.id, afterId);
    if (position === null) {
      throw new BoardChangedError();
    }
    return position;
  }
}
