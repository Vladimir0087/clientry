import { z } from 'zod';

import { instantSchema } from './instant.js';
import { TASK_LIMITS } from './limits.js';
import { idSchema } from '../common/id.js';
import { textSchema } from '../common/text.js';

const titleSchema = textSchema
  .trim()
  .min(1, { error: 'Enter a title', abort: true })
  .max(TASK_LIMITS.title, `Use at most ${String(TASK_LIMITS.title)} characters`);

const relatedRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('client'), id: idSchema('Choose a client') }),
  z.object({ kind: z.literal('deal'), id: idSchema('Choose a deal') }),
]);

export type TaskRelatedRequest = z.infer<typeof relatedRequestSchema>;

export const createTaskRequestSchema = z
  .object({
    title: titleSchema,
    dueAt: instantSchema('Choose a due date'),
    remindAt: instantSchema().nullable().optional(),
    assigneeId: idSchema('Choose a member'),
    related: relatedRequestSchema.nullable().optional(),
  })
  .meta({ id: 'CreateTaskRequest' });

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = createTaskRequestSchema
  .partial()
  .meta({ id: 'UpdateTaskRequest' });

export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const taskIdParamsSchema = z.object({ id: idSchema() });

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

const taskStatusSchema = z.enum(['open', 'done']);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const taskListQuerySchema = z
  .object({
    status: taskStatusSchema.default('open'),
    assignee: z.literal('me').optional(),
    clientId: idSchema().optional(),
    dealId: idSchema().optional(),
    cursor: z.string().max(TASK_LIMITS.cursor).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(TASK_LIMITS.maxPageSize)
      .default(TASK_LIMITS.defaultPageSize),
  })
  .refine((query) => query.clientId === undefined || query.dealId === undefined, {
    error: 'Use clientId or dealId, not both',
    path: ['dealId'],
  });

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
