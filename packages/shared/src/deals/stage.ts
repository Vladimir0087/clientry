import { z } from 'zod';

import { STAGE_LIMITS } from './limits.js';
import { idSchema } from '../common/id.js';
import { textSchema } from '../common/text.js';

export const stageKindSchema = z.enum(['open', 'won', 'lost']);

export type StageKind = z.infer<typeof stageKindSchema>;

export const stageSchema = z
  .object({ id: z.uuid(), name: z.string(), kind: stageKindSchema })
  .meta({ id: 'Stage' });

export type Stage = z.infer<typeof stageSchema>;

export const stageListItemSchema = stageSchema
  .extend({ dealCount: z.int() })
  .meta({ id: 'StageListItem' });

export type StageListItem = z.infer<typeof stageListItemSchema>;

export const stageListResponseSchema = z
  .object({ items: z.array(stageListItemSchema) })
  .meta({ id: 'StageList' });

export type StageListResponse = z.infer<typeof stageListResponseSchema>;

const stageNameSchema = textSchema
  .trim()
  .min(1, { error: 'Enter a stage name', abort: true })
  .max(STAGE_LIMITS.name, `Use at most ${String(STAGE_LIMITS.name)} characters`);

export const createStageRequestSchema = z
  .object({ name: stageNameSchema })
  .meta({ id: 'CreateStageRequest' });

export type CreateStageRequest = z.infer<typeof createStageRequestSchema>;

export const renameStageRequestSchema = z
  .object({ name: stageNameSchema })
  .meta({ id: 'RenameStageRequest' });

export type RenameStageRequest = z.infer<typeof renameStageRequestSchema>;

// The duplicate is reported on its own index, as with client tags.
export const reorderStagesRequestSchema = z
  .object({
    ids: z
      .array(idSchema())
      .min(1)
      .max(STAGE_LIMITS.openStages)
      .superRefine((ids, context) => {
        ids.forEach((id, index) => {
          if (ids.indexOf(id) !== index) {
            context.addIssue({ code: 'custom', message: 'Stages must be unique', path: [index] });
          }
        });
      }),
  })
  .meta({ id: 'ReorderStagesRequest' });

export type ReorderStagesRequest = z.infer<typeof reorderStagesRequestSchema>;

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const deleteStageQuerySchema = z.object({
  moveDealsTo: idSchema('Choose another open stage'),
});

export type DeleteStageQuery = z.infer<typeof deleteStageQuerySchema>;

export const stageIdParamsSchema = z.object({ id: idSchema() });

export type StageIdParams = z.infer<typeof stageIdParamsSchema>;
