import { z } from 'zod';

import { currencySchema } from './currency.js';
import { DEAL_LIMITS } from './limits.js';
import { idSchema } from '../common/id.js';
import { textSchema } from '../common/text.js';
import { memberFilterSchema } from '../workspaces/member-filter.js';

const titleSchema = textSchema
  .trim()
  .min(1, { error: 'Enter a title', abort: true })
  .max(DEAL_LIMITS.title, `Use at most ${String(DEAL_LIMITS.title)} characters`);

// Minor units: 150000 with USD is $1,500.00.
export const amountSchema = z
  .int({ error: 'Enter an amount' })
  .min(0, 'Amount cannot be negative')
  .max(DEAL_LIMITS.maxAmount, 'Use an amount up to 1,000,000,000');

const versionSchema = z.int().min(1);

export const createDealRequestSchema = z
  .object({
    title: titleSchema,
    clientId: idSchema('Choose a client'),
    stageId: idSchema('Choose a stage'),
    amount: amountSchema,
    currency: currencySchema,
    assigneeId: idSchema('Choose a member'),
  })
  .meta({ id: 'CreateDealRequest' });

export type CreateDealRequest = z.infer<typeof createDealRequestSchema>;

// The stage changes only through a move, so stageId is stripped here.
export const updateDealRequestSchema = createDealRequestSchema
  .omit({ stageId: true })
  .partial()
  .extend({ version: versionSchema })
  .meta({ id: 'UpdateDealRequest' });

export type UpdateDealRequest = z.infer<typeof updateDealRequestSchema>;

// afterId is the visible deal the card goes right after, or null for the top of the column.
export const moveDealRequestSchema = z
  .object({
    version: versionSchema,
    stageId: idSchema(),
    afterId: idSchema().nullable(),
  })
  .meta({ id: 'MoveDealRequest' });

export type MoveDealRequest = z.infer<typeof moveDealRequestSchema>;

export const dealIdParamsSchema = z.object({ id: idSchema() });

export type DealIdParams = z.infer<typeof dealIdParamsSchema>;

// No .meta({ id }) on query schemas: with an id Swagger stops listing the query parameters.
export const dealListQuerySchema = z.object({ clientId: idSchema() });

export type DealListQuery = z.infer<typeof dealListQuerySchema>;

export const boardQuerySchema = z.object({ assignee: memberFilterSchema.optional() });

export type BoardQuery = z.infer<typeof boardQuerySchema>;
