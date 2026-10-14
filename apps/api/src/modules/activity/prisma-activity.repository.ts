import { Injectable } from '@nestjs/common';

import { activityEntrySchema, SUBJECT_KIND_BY_TYPE } from '@clientry/shared/activity';
import type { ActivityEntry, ActivityType } from '@clientry/shared/activity';

import type {
  ActivityPage,
  ActivityPageRequest,
  ActivityRepository,
} from './activity.repository.js';
import type { CreatedAtCursor } from '../../common/pagination/created-at-cursor.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  dealClientJoin,
  dealVisible,
  taskLinkJoins,
  taskLinksVisible,
} from '../../infra/prisma/visibility.js';

const DEAL = { deal: 'sd', client: 'sdc' } as const;
const TASK = { task: 'st', client: 'stc', deal: 'std', dealClient: 'stdc' } as const;

interface EntryRow {
  readonly id: string;
  readonly type: ActivityType;
  readonly payload: unknown;
  readonly created_at: Date;
  readonly actor_id: string;
  readonly actor_name: string;
  readonly subject_id: string | null;
  readonly subject_label: string | null;
  readonly is_available: boolean | null;
}

// A stored row that does not parse fails the request with 500 rather than reaching the feed.
function toEntry(row: EntryRow): ActivityEntry {
  const entry = {
    id: row.id,
    type: row.type,
    payload: row.payload,
    actor: { id: row.actor_id, name: row.actor_name },
    subject: {
      kind: SUBJECT_KIND_BY_TYPE[row.type],
      id: row.subject_id,
      label: row.subject_label,
      isAvailable: row.is_available,
    },
    createdAt: row.created_at.toISOString(),
  };
  const result = activityEntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`Activity ${row.id} does not match activityEntrySchema`, {
      cause: result.error,
    });
  }
  return result.data;
}

// Postgres cannot seek an index by the OR alone; the redundant bound starts the scan at the cursor.
function before(cursor: CreatedAtCursor | null): Prisma.Sql {
  if (cursor === null) {
    return Prisma.empty;
  }
  const createdAt = Prisma.sql`${cursor.createdAt}::timestamptz`;
  return Prisma.sql`AND a.created_at <= ${createdAt} AND (a.created_at < ${createdAt}
    OR (a.created_at = ${createdAt} AND a.id < ${cursor.id}::uuid))`;
}

@Injectable()
export class PrismaActivityRepository implements ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  // One statement per page: the outer joins only add columns, so the limit stops the index scan.
  // One extra row tells whether a next page exists.
  async feed(workspaceId: string, { after, limit }: ActivityPageRequest): Promise<ActivityPage> {
    const rows = await this.prisma.$queryRaw<EntryRow[]>`
      SELECT a.id, a.type, a.payload, a.created_at, u.id AS actor_id, u.name AS actor_name,
        COALESCE(a.deal_id, a.client_id, a.task_id) AS subject_id,
        COALESCE(sd.title, sc.name, st.title) AS subject_label,
        CASE
          WHEN a.deal_id IS NOT NULL THEN ${dealVisible(DEAL)}
          WHEN a.client_id IS NOT NULL THEN sc.deleted_at IS NULL
          ELSE st.deleted_at IS NULL AND ${taskLinksVisible(TASK)}
        END AS is_available
      FROM activities a
      JOIN users u ON u.id = a.actor_id
      LEFT JOIN deals sd ON sd.id = a.deal_id
      ${dealClientJoin(DEAL)}
      LEFT JOIN clients sc ON sc.id = a.client_id
      LEFT JOIN tasks st ON st.id = a.task_id
      ${taskLinkJoins(TASK)}
      WHERE a.workspace_id = ${workspaceId}::uuid ${before(after)}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit + 1}`;
    return { items: rows.slice(0, limit).map(toEntry), hasMore: rows.length > limit };
  }
}
