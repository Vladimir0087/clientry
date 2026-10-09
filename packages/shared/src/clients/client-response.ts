import { z } from 'zod';

import { clientSourceSchema } from './client-source.js';

export const clientResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    company: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    source: clientSourceSchema.nullable(),
    notes: z.string().nullable(),
    tags: z.array(z.string()),
    createdBy: z.object({ id: z.uuid(), name: z.string() }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Client' });

export type Client = z.infer<typeof clientResponseSchema>;

export const clientSummarySchema = clientResponseSchema
  .omit({ notes: true })
  .meta({ id: 'ClientSummary' });

export type ClientSummary = z.infer<typeof clientSummarySchema>;
