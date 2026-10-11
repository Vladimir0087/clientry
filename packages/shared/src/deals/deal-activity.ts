import { z } from 'zod';

import { currencySchema } from './currency.js';
import { dealRefSchema } from './deal-response.js';
import { stageSchema } from './stage.js';

const moneySchema = z.object({ amount: z.int(), currency: currencySchema });

// A currency change travels with the amount, so it is one item.
export const dealChangeSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('title'), from: z.string(), to: z.string() }),
  z.object({ field: z.literal('amount'), from: moneySchema, to: moneySchema }),
  z.object({ field: z.literal('client'), from: dealRefSchema, to: dealRefSchema }),
  z.object({ field: z.literal('assignee'), from: dealRefSchema, to: dealRefSchema }),
]);

export type DealChange = z.infer<typeof dealChangeSchema>;

// Payloads are snapshots: names as they were when the event happened.
const createdEventSchema = z.object({
  type: z.literal('deal_created'),
  payload: z.object({ stage: stageSchema, amount: z.int(), currency: currencySchema }),
});

const movedEventSchema = z.object({
  type: z.literal('deal_moved'),
  payload: z.object({
    from: stageSchema,
    to: stageSchema,
    reason: z.literal('stage_deleted').optional(),
  }),
});

const updatedEventSchema = z.object({
  type: z.literal('deal_updated'),
  payload: z.object({ changes: z.array(dealChangeSchema).min(1) }),
});

const deletedEventSchema = z.object({
  type: z.literal('deal_deleted'),
  payload: z.object({}),
});

const restoredEventSchema = z.object({
  type: z.literal('deal_restored'),
  payload: z.object({}),
});

export const dealEventSchema = z.discriminatedUnion('type', [
  createdEventSchema,
  movedEventSchema,
  updatedEventSchema,
  deletedEventSchema,
  restoredEventSchema,
]);

export type DealEvent = z.infer<typeof dealEventSchema>;

const entryFields = {
  id: z.uuid(),
  actor: dealRefSchema,
  createdAt: z.iso.datetime(),
};

export const dealActivitySchema = z
  .discriminatedUnion('type', [
    createdEventSchema.extend(entryFields),
    movedEventSchema.extend(entryFields),
    updatedEventSchema.extend(entryFields),
    deletedEventSchema.extend(entryFields),
    restoredEventSchema.extend(entryFields),
  ])
  .meta({ id: 'DealActivity' });

export type DealActivity = z.infer<typeof dealActivitySchema>;

export const dealHistoryResponseSchema = z
  .object({ items: z.array(dealActivitySchema), hasMore: z.boolean() })
  .meta({ id: 'DealHistory' });

export type DealHistoryResponse = z.infer<typeof dealHistoryResponseSchema>;
