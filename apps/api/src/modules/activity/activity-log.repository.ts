import { Injectable } from '@nestjs/common';

import { activityEventSchema, SUBJECT_KIND_BY_TYPE } from '@clientry/shared/activity';
import type { ActivityEvent } from '@clientry/shared/activity';

import type { Prisma } from '../../infra/prisma/generated/client.js';

export interface ActivityRecord {
  readonly workspaceId: string;
  readonly actorId: string;
  // The deal, client or task the event is about, as its type says.
  readonly subjectId: string;
  readonly event: ActivityEvent;
}

function toRow({
  workspaceId,
  actorId,
  subjectId,
  event,
}: ActivityRecord): Prisma.ActivityCreateManyInput {
  const { type, payload } = activityEventSchema.parse(event);
  const kind = SUBJECT_KIND_BY_TYPE[type];
  return {
    workspaceId,
    actorId,
    type,
    payload,
    dealId: kind === 'deal' ? subjectId : null,
    clientId: kind === 'client' ? subjectId : null,
    taskId: kind === 'task' ? subjectId : null,
  };
}

// The only application code that writes activities, always inside the caller's transaction.
@Injectable()
export class ActivityLog {
  // Every entry is parsed before anything is written; one statement for the batch.
  async record(tx: Prisma.TransactionClient, entries: readonly ActivityRecord[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const data = entries.map(toRow);
    await tx.activity.createMany({ data });
  }
}
