import { Injectable, Logger } from '@nestjs/common';

import { canDeleteRecord } from '@clientry/shared/auth';
import { DEAL_LIMITS } from '@clientry/shared/deals';
import type {
  CreateDealRequest,
  Deal,
  DealHistoryResponse,
  DealListQuery,
  DealListResponse,
  UpdateDealRequest,
} from '@clientry/shared/deals';

import { changedFields, hasChanges, historyChanges } from './deal-changes.js';
import type { DealEdit } from './deal-changes.js';
import { positionBetween } from './deal-position.js';
import { referenceErrors } from './deal-references.js';
import { DealsRepository } from './deals.repository.js';
import type { DealsTransaction } from './deals.repository.js';
import { DealChangedError, DealDeleteForbiddenError, DealNotFoundError } from './errors.js';
import { staleDealError } from './stale-deal.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(private readonly deals: DealsRepository) {}

  async get(user: AuthUser, id: string): Promise<Deal> {
    const deal = await this.deals.findById(user.workspaceId, id);
    if (!deal) {
      throw new DealNotFoundError();
    }
    return deal;
  }

  async listByClient(user: AuthUser, { clientId }: DealListQuery): Promise<DealListResponse> {
    const page = await this.deals.listByClient(user.workspaceId, clientId, DEAL_LIMITS.clientDeals);
    return { items: [...page.items], hasMore: page.hasMore };
  }

  async history(user: AuthUser, id: string): Promise<DealHistoryResponse> {
    if (!(await this.deals.isVisible(user.workspaceId, id))) {
      throw new DealNotFoundError();
    }
    const page = await this.deals.history(user.workspaceId, id, DEAL_LIMITS.history);
    return { items: [...page.items], hasMore: page.hasMore };
  }

  // The new deal goes to the top of its stage; a won or lost stage closes it right away.
  async create(user: AuthUser, input: CreateDealRequest): Promise<Deal> {
    const { workspaceId } = user;
    const deal = await this.deals.inTransaction(async (deals) => {
      // One connection serves the transaction, so the checks run one after another.
      const client = await deals.findClient(workspaceId, input.clientId);
      const stage = await deals.findStage(workspaceId, input.stageId);
      const member = await deals.findMember(workspaceId, input.assigneeId);
      if (!client || !stage || !member) {
        throw new RequestValidationError(
          referenceErrors({ clientId: client, stageId: stage, assigneeId: member }),
        );
      }
      const first = await deals.findNextPosition(workspaceId, stage.id, null, null);
      const created = await deals.create(workspaceId, user.id, {
        ...input,
        position: positionBetween(null, first),
        closedAt: stage.kind === 'open' ? null : new Date(),
      });
      await deals.addActivity(workspaceId, created.id, user.id, {
        type: 'deal_created',
        payload: { stage, amount: input.amount, currency: input.currency },
      });
      return created;
    });
    this.logger.log(this.logContext(user, deal.id), 'Deal created');
    return deal;
  }

  // Sent values equal to the stored ones are dropped; nothing left reads the deal unchanged.
  async update(user: AuthUser, id: string, input: UpdateDealRequest): Promise<Deal> {
    const { version, ...sent } = input;
    const { workspaceId } = user;
    return this.deals.inTransaction(async (deals) => {
      const current = await deals.findById(workspaceId, id);
      if (!current) {
        throw new DealNotFoundError();
      }
      const edit = changedFields(current, sent);
      if (!hasChanges(edit)) {
        return current;
      }
      if (current.version !== version) {
        throw new DealChangedError();
      }
      await this.checkEditReferences(deals, workspaceId, edit);
      const updated = await deals.update(workspaceId, id, version, edit);
      if (!updated) {
        throw await staleDealError(deals, workspaceId, id);
      }
      await deals.addActivity(workspaceId, id, user.id, {
        type: 'deal_updated',
        payload: { changes: historyChanges(current, updated) },
      });
      return updated;
    });
  }

  async delete(user: AuthUser, id: string): Promise<void> {
    const { workspaceId } = user;
    await this.deals.inTransaction(async (deals) => {
      const ownership = await deals.findOwnership(workspaceId, id);
      if (!ownership || ownership.isDeleted || ownership.isClientDeleted) {
        throw new DealNotFoundError();
      }
      this.assertCanDelete(user, ownership.createdById);
      if (!(await deals.softDelete(workspaceId, id))) {
        throw new DealNotFoundError();
      }
      await deals.addActivity(workspaceId, id, user.id, { type: 'deal_deleted', payload: {} });
    });
    this.logger.log(this.logContext(user, id), 'Deal deleted');
  }

  // Restoring an active deal returns it unchanged, so a repeated undo is harmless.
  async restore(user: AuthUser, id: string): Promise<Deal> {
    const { workspaceId } = user;
    const { deal, isRestored } = await this.deals.inTransaction(async (deals) => {
      const ownership = await deals.findOwnership(workspaceId, id);
      if (!ownership || ownership.isClientDeleted) {
        throw new DealNotFoundError();
      }
      this.assertCanDelete(user, ownership.createdById);
      const hasRestored = ownership.isDeleted && (await deals.restore(workspaceId, id));
      if (hasRestored) {
        await deals.addActivity(workspaceId, id, user.id, { type: 'deal_restored', payload: {} });
      }
      const restored = await deals.findById(workspaceId, id);
      if (!restored) {
        throw new DealNotFoundError();
      }
      return { deal: restored, isRestored: hasRestored };
    });
    if (isRestored) {
      this.logger.log(this.logContext(user, id), 'Deal restored');
    }
    return deal;
  }

  private async checkEditReferences(
    deals: DealsTransaction,
    workspaceId: string,
    { clientId, assigneeId }: DealEdit,
  ): Promise<void> {
    const client =
      clientId === undefined ? undefined : await deals.findClient(workspaceId, clientId);
    const member =
      assigneeId === undefined ? undefined : await deals.findMember(workspaceId, assigneeId);
    const errors = referenceErrors({ clientId: client, assigneeId: member });
    if (errors.length > 0) {
      throw new RequestValidationError(errors);
    }
  }

  private assertCanDelete(user: AuthUser, createdById: string): void {
    if (!canDeleteRecord({ userId: user.id, role: user.role }, createdById)) {
      throw new DealDeleteForbiddenError();
    }
  }

  private logContext(user: AuthUser, dealId: string): Record<string, string> {
    return { dealId, workspaceId: user.workspaceId, userId: user.id };
  }
}
