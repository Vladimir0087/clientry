import { dealEventSchema } from '@clientry/shared/deals';
import type { Stage, StageListItem } from '@clientry/shared/deals';

import { visible } from './deal-reads.repository.js';
import type { DealMovedEvent, DealTransfer, LockedStagesRepository } from './stages.repository.js';
import type { Prisma } from '../../infra/prisma/generated/client.js';

const STAGE_SELECT = { id: true, name: true, kind: true } satisfies Prisma.StageSelect;

const BOARD_ORDER = [
  { position: 'asc' },
  { id: 'asc' },
] satisfies Prisma.StageOrderByWithRelationInput[];

export async function listWithCounts(
  db: Prisma.TransactionClient,
  workspaceId: string,
): Promise<StageListItem[]> {
  const rows = await db.stage.findMany({
    where: { workspaceId },
    orderBy: BOARD_ORDER,
    select: {
      ...STAGE_SELECT,
      // workspaceId too: the count runs as one GROUP BY over deals, which the join does not narrow.
      _count: { select: { deals: { where: visible(workspaceId) } } },
    },
  });
  return rows.map(({ _count, ...stage }) => ({ ...stage, dealCount: _count.deals }));
}

export class PrismaLockedStagesRepository implements LockedStagesRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  list(workspaceId: string): Promise<Stage[]> {
    return this.tx.stage.findMany({
      where: { workspaceId },
      orderBy: BOARD_ORDER,
      select: STAGE_SELECT,
    });
  }

  listWithCounts(workspaceId: string): Promise<StageListItem[]> {
    return listWithCounts(this.tx, workspaceId);
  }

  create(workspaceId: string, name: string, position: number): Promise<Stage> {
    return this.tx.stage.create({
      data: { workspaceId, name, position, kind: 'open' },
      select: STAGE_SELECT,
    });
  }

  rename(workspaceId: string, id: string, name: string): Promise<Stage> {
    return this.tx.stage.update({
      where: { id, workspaceId },
      data: { name },
      select: STAGE_SELECT,
    });
  }

  async saveOrder(workspaceId: string, ids: readonly string[]): Promise<void> {
    await this.tx.$executeRaw`
      UPDATE stages AS s SET position = o.ordinality - 1, updated_at = now()
      FROM unnest(${[...ids]}::uuid[]) WITH ORDINALITY AS o(id, ordinality)
      WHERE s.id = o.id AND s.workspace_id = ${workspaceId}::uuid
        AND s.position <> o.ordinality - 1`;
  }

  async lockStage(workspaceId: string, id: string): Promise<void> {
    await this.tx.$queryRaw`
      SELECT id FROM stages WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
      FOR UPDATE`;
  }

  // Locked, so a concurrent move out of the stage either lands first and is skipped here, or waits
  // and fails its version check. NO KEY: entries for these deals may still be inserted meanwhile.
  async listDealIds(workspaceId: string, stageId: string): Promise<string[]> {
    await this.tx.$queryRaw`
      SELECT id FROM deals
      WHERE workspace_id = ${workspaceId}::uuid AND stage_id = ${stageId}::uuid
      FOR NO KEY UPDATE`;
    // Read after the lock: a locking query sorts its rows before it waits.
    const rows = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM deals
      WHERE workspace_id = ${workspaceId}::uuid AND stage_id = ${stageId}::uuid
      ORDER BY position, id`;
    return rows.map(({ id }) => id);
  }

  async findLastPosition(workspaceId: string, stageId: string): Promise<string | null> {
    const row = await this.tx.deal.findFirst({
      where: { workspaceId, stageId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });
    return row?.position ?? null;
  }

  async transferDeals(
    workspaceId: string,
    actorId: string,
    targetStageId: string,
    transfers: readonly DealTransfer[],
    event: DealMovedEvent,
  ): Promise<void> {
    if (transfers.length === 0) {
      return;
    }
    const { type, payload } = dealEventSchema.parse(event);
    const ids = transfers.map(({ id }) => id);
    const positions = transfers.map(({ position }) => position);
    await this.tx.$executeRaw`
      UPDATE deals AS d
      SET stage_id = ${targetStageId}::uuid, position = t.position, version = d.version + 1,
        updated_at = now()
      FROM unnest(${ids}::uuid[], ${positions}::text[]) AS t(id, position)
      WHERE d.id = t.id AND d.workspace_id = ${workspaceId}::uuid`;
    await this.tx.activity.createMany({
      data: ids.map((dealId) => ({ workspaceId, dealId, actorId, type, payload })),
    });
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await this.tx.stage.delete({ where: { id, workspaceId } });
  }
}
