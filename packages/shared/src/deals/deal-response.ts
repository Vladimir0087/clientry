import { z } from 'zod';

import { currencySchema } from './currency.js';
import { stageSchema } from './stage.js';

export const dealRefSchema = z.object({ id: z.uuid(), name: z.string() });

export type DealRef = z.infer<typeof dealRefSchema>;

export const dealSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    amount: z.int(),
    currency: currencySchema,
    stage: stageSchema,
    client: dealRefSchema,
    assignee: dealRefSchema,
    createdBy: dealRefSchema,
    closedAt: z.iso.datetime().nullable(),
    version: z.int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Deal' });

export type Deal = z.infer<typeof dealSchema>;

export const dealCardSchema = dealSchema
  .pick({
    id: true,
    title: true,
    amount: true,
    currency: true,
    client: true,
    assignee: true,
    closedAt: true,
    version: true,
  })
  .meta({ id: 'DealCard' });

export type DealCard = z.infer<typeof dealCardSchema>;

export const currencyTotalSchema = z.object({
  currency: currencySchema,
  amount: z.int(),
  count: z.int(),
});

export type CurrencyTotal = z.infer<typeof currencyTotalSchema>;

// count and totals cover every visible deal of the column, not only the cards returned.
export const boardColumnSchema = z
  .object({
    stage: stageSchema,
    deals: z.array(dealCardSchema),
    count: z.int(),
    totals: z.array(currencyTotalSchema),
  })
  .meta({ id: 'BoardColumn' });

export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardResponseSchema = z
  .object({ columns: z.array(boardColumnSchema) })
  .meta({ id: 'Board' });

export type Board = z.infer<typeof boardResponseSchema>;

export const dealListResponseSchema = z
  .object({ items: z.array(dealSchema), hasMore: z.boolean() })
  .meta({ id: 'DealList' });

export type DealListResponse = z.infer<typeof dealListResponseSchema>;
