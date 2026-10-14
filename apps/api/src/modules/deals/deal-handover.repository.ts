import { Injectable } from '@nestjs/common';

import type { DealEvent, DealRef } from '@clientry/shared/deals';

import type { Prisma } from '../../infra/prisma/generated/client.js';
import { ActivityLog } from '../activity/activity-log.repository.js';

export interface DealHandoverInput {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly from: DealRef;
  readonly to: DealRef;
}

// Runs in the caller's transaction: a member's removal hands their open deals over as it commits.
@Injectable()
export class DealHandover {
  constructor(private readonly activityLog: ActivityLog) {}

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
    const event: DealEvent = {
      type: 'deal_updated',
      payload: { changes: [{ field: 'assignee', from, to }] },
    };
    await this.activityLog.record(
      tx,
      rows.map(({ id }) => ({ workspaceId, actorId, subjectId: id, event })),
    );
    return rows.length;
  }
}
