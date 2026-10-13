import { z } from 'zod';

import { clientTagSchema } from './client-request.js';
import { clientSummarySchema } from './client-response.js';
import { clientSourceSchema } from './client-source.js';
import { CLIENT_LIMITS } from './limits.js';
import { oneOrMany } from '../common/one-or-many.js';
import { textSchema } from '../common/text.js';
import { memberFilterSchema } from '../workspaces/member-filter.js';

export const clientSortSchema = z.enum(['newest', 'oldest', 'name_asc', 'name_desc']);

export type ClientSort = z.infer<typeof clientSortSchema>;

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const clientListQuerySchema = z.object({
  q: textSchema
    .trim()
    .max(CLIENT_LIMITS.search, `Use at most ${String(CLIENT_LIMITS.search)} characters`)
    .optional(),
  source: oneOrMany(clientSourceSchema, CLIENT_LIMITS.sources).optional(),
  tag: oneOrMany(clientTagSchema, CLIENT_LIMITS.tags).optional(),
  createdBy: memberFilterSchema.optional(),
  sort: clientSortSchema.default('newest'),
  cursor: z.string().max(CLIENT_LIMITS.cursor).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CLIENT_LIMITS.maxPageSize)
    .default(CLIENT_LIMITS.defaultPageSize),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientListResponseSchema = z
  .object({
    items: z.array(clientSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ClientList' });

export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

export const clientTagCountSchema = z.object({ tag: z.string(), count: z.int() });

export type ClientTagCount = z.infer<typeof clientTagCountSchema>;

export const clientTagsResponseSchema = z
  .object({ items: z.array(clientTagCountSchema) })
  .meta({ id: 'ClientTags' });

export type ClientTagsResponse = z.infer<typeof clientTagsResponseSchema>;
