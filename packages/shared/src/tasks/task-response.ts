import { z } from 'zod';

const taskRefSchema = z.object({ id: z.uuid(), name: z.string() });

export type TaskRef = z.infer<typeof taskRefSchema>;

// A deal link carries the deal's current client, which the task does not store.
const relatedSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('client'), id: z.uuid(), name: z.string() }),
  z.object({ kind: z.literal('deal'), id: z.uuid(), title: z.string(), client: taskRefSchema }),
]);

export type TaskRelated = z.infer<typeof relatedSchema>;

export const taskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    dueAt: z.iso.datetime(),
    remindAt: z.iso.datetime().nullable(),
    reminderSentAt: z.iso.datetime().nullable(),
    doneAt: z.iso.datetime().nullable(),
    assignee: taskRefSchema,
    createdBy: taskRefSchema,
    related: relatedSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Task' });

export type Task = z.infer<typeof taskSchema>;

export const taskListResponseSchema = z
  .object({ items: z.array(taskSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'TaskList' });

export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
