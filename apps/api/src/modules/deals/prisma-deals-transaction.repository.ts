import { dealEventSchema } from '@clientry/shared/deals';
import type { Deal, DealEvent, DealRef, Stage } from '@clientry/shared/deals';

import type { DealEdit } from './deal-changes.js';
import { findDeal, visible } from './deal-reads.repository.js';
import { referenceErrors } from './deal-references.js';
import type {
  DealOwnership,
  DealPlacement,
  DealsTransaction,
  NewDeal,
} from './deals.repository.js';
import { BoardChangedError } from './errors.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';
import { Prisma } from '../../infra/prisma/generated/client.js';

const FOREIGN_KEY_VIOLATION = 'P2003';

// Stages are the only referenced rows that are ever deleted, so a violation names the stage.
function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION
  );
}

export class PrismaDealsTransaction implements DealsTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findById(workspaceId: string, id: string): Promise<Deal | null> {
    return findDeal(this.tx, workspaceId, id);
  }

  // FOR SHARE: a delete of the client waits for the deal to commit, or the deal sees it gone.
  async findClient(workspaceId: string, clientId: string): Promise<DealRef | null> {
    const [client] = await this.tx.$queryRaw<DealRef[]>`
      SELECT id, name FROM clients
      WHERE id = ${clientId}::uuid AND workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
      FOR SHARE`;
    return client ?? null;
  }

  findStage(workspaceId: string, stageId: string): Promise<Stage | null> {
    return this.tx.stage.findFirst({
      where: { id: stageId, workspaceId },
      select: { id: true, name: true, kind: true },
    });
  }

  // FOR SHARE, as for the client: a removal of the member waits for the deal or is seen.
  async findMember(workspaceId: string, userId: string): Promise<DealRef | null> {
    const [member] = await this.tx.$queryRaw<DealRef[]>`
      SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ${workspaceId}::uuid AND m.user_id = ${userId}::uuid
      FOR SHARE OF m`;
    return member ?? null;
  }

  async findBoardPosition(
    workspaceId: string,
    stageId: string,
    dealId: string,
  ): Promise<string | null> {
    const row = await this.tx.deal.findFirst({
      where: { id: dealId, stageId, ...visible(workspaceId) },
      select: { position: true },
    });
    return row?.position ?? null;
  }

  async findNextPosition(
    workspaceId: string,
    stageId: string,
    after: string | null,
    excludeId: string | null,
  ): Promise<string | null> {
    const row = await this.tx.deal.findFirst({
      where: {
        workspaceId,
        stageId,
        id: excludeId === null ? undefined : { not: excludeId },
        position: after === null ? undefined : { gt: after },
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { position: true },
    });
    return row?.position ?? null;
  }

  async create(workspaceId: string, createdById: string, deal: NewDeal): Promise<Deal> {
    try {
      const { id } = await this.tx.deal.create({
        data: { ...deal, workspaceId, createdById },
        select: { id: true },
      });
      const created = await this.findById(workspaceId, id);
      if (!created) {
        throw new Error(`Deal ${id} not readable right after it was created`);
      }
      return created;
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new RequestValidationError(referenceErrors({ stageId: null }));
      }
      throw error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    version: number,
    edit: DealEdit,
  ): Promise<Deal | null> {
    const { count } = await this.tx.deal.updateMany({
      where: { id, version, ...visible(workspaceId) },
      data: { ...edit, version: { increment: 1 } },
    });
    return count === 0 ? null : this.findById(workspaceId, id);
  }

  async move(
    workspaceId: string,
    id: string,
    version: number,
    placement: DealPlacement,
  ): Promise<Deal | null> {
    try {
      const { count } = await this.tx.deal.updateMany({
        where: { id, version, ...visible(workspaceId) },
        data: { ...placement, version: { increment: 1 } },
      });
      return count === 0 ? null : await this.findById(workspaceId, id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BoardChangedError();
      }
      throw error;
    }
  }

  async findOwnership(workspaceId: string, id: string): Promise<DealOwnership | null> {
    const row = await this.tx.deal.findFirst({
      where: { id, workspaceId },
      select: { createdById: true, deletedAt: true, client: { select: { deletedAt: true } } },
    });
    if (!row) {
      return null;
    }
    return {
      createdById: row.createdById,
      isDeleted: row.deletedAt !== null,
      isClientDeleted: row.client.deletedAt !== null,
    };
  }

  async softDelete(workspaceId: string, id: string): Promise<boolean> {
    const { count } = await this.tx.deal.updateMany({
      where: { id, ...visible(workspaceId) },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return count > 0;
  }

  async restore(workspaceId: string, id: string): Promise<boolean> {
    const { count } = await this.tx.deal.updateMany({
      where: { id, workspaceId, deletedAt: { not: null }, client: { deletedAt: null } },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    return count > 0;
  }

  async addActivity(
    workspaceId: string,
    dealId: string,
    actorId: string,
    event: DealEvent,
  ): Promise<void> {
    const { type, payload } = dealEventSchema.parse(event);
    await this.tx.activity.create({ data: { workspaceId, dealId, actorId, type, payload } });
  }
}
