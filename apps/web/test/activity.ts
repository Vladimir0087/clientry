import { activityEntrySchema, activityFeedResponseSchema } from '@clientry/shared/activity';
import type { ActivityEntry, ActivityFeedResponse } from '@clientry/shared/activity';

const ANN = { id: '0b6f2a8e-4c1d-4e7a-9f3b-2d5c8e1a7b40', name: 'Ann' };

function entryId(index: number): string {
  return `0199b1f0-2a3b-7c4d-8e5f-${String(index).padStart(12, '0')}`;
}

function subjectId(index: number): string {
  return `0199b1e2-3c4d-7e5f-8a9b-${String(index).padStart(12, '0')}`;
}

type EntryFields = Pick<ActivityEntry, 'type' | 'payload'> & Partial<ActivityEntry>;

// A deal_deleted entry by Ann unless the fields say otherwise; newer entries get higher indexes.
export function makeActivityEntry(index: number, fields: Partial<EntryFields> = {}): ActivityEntry {
  const type = fields.type ?? 'deal_deleted';
  const kind = type.startsWith('deal_') ? 'deal' : type === 'client_created' ? 'client' : 'task';
  return activityEntrySchema.parse({
    id: entryId(index),
    type,
    payload: {},
    actor: ANN,
    subject: { kind, id: subjectId(index), label: `Subject ${String(index)}`, isAvailable: true },
    createdAt: new Date(Date.UTC(2026, 9, 13, 9, index)).toISOString(),
    ...fields,
  });
}

export function makeActivityPage(
  items: readonly ActivityEntry[],
  nextCursor: string | null = null,
): ActivityFeedResponse {
  return activityFeedResponseSchema.parse({ items, nextCursor });
}
