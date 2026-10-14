import { z } from 'zod';

import { ACTIVITY_LIMITS } from './limits.js';
import { dealEventSchema } from '../deals/deal-activity.js';
import { dealRefSchema } from '../deals/deal-response.js';

// Payloads are snapshots: names as they were when the event happened.
const clientCreatedEventSchema = z.object({
  type: z.literal('client_created'),
  payload: z.object({}),
});

const taskCreatedEventSchema = z.object({
  type: z.literal('task_created'),
  payload: z.object({ assignee: dealRefSchema, dueAt: z.iso.datetime() }),
});

const taskCompletedEventSchema = z.object({
  type: z.literal('task_completed'),
  payload: z.object({}),
});

const [dealCreated, dealMoved, dealUpdated, dealDeleted, dealRestored] = dealEventSchema.options;

export const activityEventSchema = z.discriminatedUnion('type', [
  ...dealEventSchema.options,
  clientCreatedEventSchema,
  taskCreatedEventSchema,
  taskCompletedEventSchema,
]);

export type ActivityEvent = z.infer<typeof activityEventSchema>;

export type ActivityType = ActivityEvent['type'];

export type ActivitySubjectKind = 'deal' | 'client' | 'task';

// The one place that ties a type to the record it is about.
export const SUBJECT_KIND_BY_TYPE = {
  deal_created: 'deal',
  deal_moved: 'deal',
  deal_updated: 'deal',
  deal_deleted: 'deal',
  deal_restored: 'deal',
  client_created: 'client',
  task_created: 'task',
  task_completed: 'task',
} as const satisfies Record<ActivityType, ActivitySubjectKind>;

// label is the subject's current title or name; isAvailable says whether its page opens now.
function subjectSchema<K extends ActivitySubjectKind>(kind: K) {
  return z.object({
    kind: z.literal(kind),
    id: z.uuid(),
    label: z.string(),
    isAvailable: z.boolean(),
  });
}

const entryFields = { id: z.uuid(), actor: dealRefSchema, createdAt: z.iso.datetime() };

const dealEntryFields = { ...entryFields, subject: subjectSchema('deal') };

export const activityEntrySchema = z
  .discriminatedUnion('type', [
    dealCreated.extend(dealEntryFields),
    dealMoved.extend(dealEntryFields),
    dealUpdated.extend(dealEntryFields),
    dealDeleted.extend(dealEntryFields),
    dealRestored.extend(dealEntryFields),
    clientCreatedEventSchema.extend({ ...entryFields, subject: subjectSchema('client') }),
    taskCreatedEventSchema.extend({ ...entryFields, subject: subjectSchema('task') }),
    taskCompletedEventSchema.extend({ ...entryFields, subject: subjectSchema('task') }),
  ])
  .meta({ id: 'ActivityEntry' });

export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export type ActivitySubject = ActivityEntry['subject'];

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const activityFeedQuerySchema = z.object({
  cursor: z.string().max(ACTIVITY_LIMITS.cursor).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_LIMITS.maxPageSize)
    .default(ACTIVITY_LIMITS.defaultPageSize),
});

export type ActivityFeedQuery = z.infer<typeof activityFeedQuerySchema>;

export const activityFeedResponseSchema = z
  .object({ items: z.array(activityEntrySchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ActivityFeed' });

export type ActivityFeedResponse = z.infer<typeof activityFeedResponseSchema>;
