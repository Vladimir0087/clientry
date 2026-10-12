import { z } from 'zod';

import { NOTIFICATION_LIMITS } from './limits.js';
import { idSchema } from '../common/id.js';

// Payloads are snapshots of the moment the notification was written.
const taskReminderEventSchema = z.object({
  type: z.literal('task_reminder'),
  payload: z.object({
    task: z.object({ id: z.uuid(), title: z.string() }),
    dueAt: z.iso.datetime(),
  }),
});

export const notificationEventSchema = z.discriminatedUnion('type', [taskReminderEventSchema]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

const entryFields = {
  id: z.uuid(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
};

export const notificationSchema = z
  .discriminatedUnion('type', [taskReminderEventSchema.extend(entryFields)])
  .meta({ id: 'Notification' });

export type Notification = z.infer<typeof notificationSchema>;

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const notificationListQuerySchema = z.object({
  cursor: z.string().max(NOTIFICATION_LIMITS.cursor).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_LIMITS.maxPageSize)
    .default(NOTIFICATION_LIMITS.defaultPageSize),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z
  .object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'NotificationList' });

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const unreadCountResponseSchema = z.object({ count: z.int() }).meta({ id: 'UnreadCount' });

export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

// before is the createdAt of the newest notification the user has seen.
export const markAllReadRequestSchema = z
  .object({ before: z.iso.datetime() })
  .meta({ id: 'MarkAllReadRequest' });

export type MarkAllReadRequest = z.infer<typeof markAllReadRequestSchema>;

export const notificationIdParamsSchema = z.object({ id: idSchema() });

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
