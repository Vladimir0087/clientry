import { z } from 'zod';

import { DASHBOARD_LIMITS } from './limits.js';
import { dealTotalsSchema } from './summary.js';
import { instantSchema } from '../tasks/instant.js';

const BOUNDS_ERROR = `Use ${String(DASHBOARD_LIMITS.minBounds)} to ${String(DASHBOARD_LIMITS.maxBounds)} bounds in ascending order`;

const boundSchema = instantSchema(BOUNDS_ERROR);

// Stored-form strings of one format compare as their instants do.
function toBounds(values: readonly string[]): string[] | null {
  if (values.length < DASHBOARD_LIMITS.minBounds || values.length > DASHBOARD_LIMITS.maxBounds) {
    return null;
  }
  const bounds: string[] = [];
  for (const value of values) {
    const result = boundSchema.safeParse(value);
    const previous = bounds.at(-1);
    if (!result.success || (previous !== undefined && result.data <= previous)) {
      return null;
    }
    bounds.push(result.data);
  }
  return bounds;
}

// The query parser gives a string for one value and an array for several, as oneOrMany reads
// them; wrapped first, so Swagger lists an array. Every failure is one message on bounds.
const boundsSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.string(), { error: BOUNDS_ERROR }).transform((values, context) => {
    const bounds = toBounds(values);
    if (bounds === null) {
      context.addIssue({ code: 'custom', message: BOUNDS_ERROR });
      return z.NEVER;
    }
    return bounds;
  }),
);

// No .meta({ id }): with an id Swagger gets a $ref and stops listing the query parameters.
export const closedDealsQuerySchema = z.object({ bounds: boundsSchema });

export type ClosedDealsQuery = z.infer<typeof closedDealsQuerySchema>;

export const closedDealsPeriodSchema = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    won: dealTotalsSchema,
    lost: dealTotalsSchema,
  })
  .meta({ id: 'ClosedDealsPeriod' });

export type ClosedDealsPeriod = z.infer<typeof closedDealsPeriodSchema>;

export const closedDealsResponseSchema = z
  .object({ periods: z.array(closedDealsPeriodSchema) })
  .meta({ id: 'ClosedDeals' });

export type ClosedDeals = z.infer<typeof closedDealsResponseSchema>;
