import { z } from 'zod';

// Express's simple query parser yields a string for one value and an array for several.
export function oneOrMany<T extends z.ZodType>(
  schema: T,
  max: number,
): z.ZodUnion<readonly [T, z.ZodArray<T>]> {
  return z.union([
    schema,
    z
      .array(schema)
      .min(1)
      .max(max, `Use at most ${String(max)} values`),
  ] as const);
}
