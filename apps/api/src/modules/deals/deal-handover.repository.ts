import { Injectable } from '@nestjs/common';

import { dealEventSchema } from '@clientry/shared/deals';
import type { DealRef } from '@clientry/shared/deals';

import type { Prisma } from '../../infra/prisma/generated/client.js';

export interface DealHandoverInput {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly from: DealRef;
  readonly to: DealRef;
}

// Runs in the caller's transaction: a member's removal hands their open deals over as it commits.
@Injectable()
export class DealHandover {
  // Every open deal of from, deleted and hidden ones included, gets version + 1 and a history
  // entry; returns how many moved. Two statements whatever the number of deals.
  async handOpenDealsOver(
    tx: Prisma.TransactionClient,
    { workspaceId, actorId, from, to }: DealHandoverInput,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE deals SET assignee_id = ${to.id}::uuid, version = version + 1, updated_at = now()
      WHERE workspace_id = ${workspaceId}::uuid AND assignee_id = ${from.id}::uuid
        AND closed_at IS NULL
      RETURNING id`;
    if (rows.length === 0) {
      return 0;
    }
    const { type, payload } = dealEventSchema.parse({
      type: 'deal_updated',
      payload: { changes: [{ field: 'assignee', from, to }] },
    });
    await tx.activity.createMany({
      data: rows.map(({ id }) => ({ workspaceId, dealId: id, actorId, type, payload })),
    });
    return rows.length;
  }
}
