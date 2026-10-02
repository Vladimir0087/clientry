import { z } from 'zod';

import { problemDetailsSchema } from './problem-details.js';

export const fieldErrorSchema = z
  .object({
    // Dot-joined, "" for the root: the shape react-hook-form's setError takes.
    path: z.string(),
    message: z.string(),
  })
  .meta({ id: 'FieldError' });

export type FieldError = z.infer<typeof fieldErrorSchema>;

export const apiProblemSchema = problemDetailsSchema
  .extend({
    // Plain string, not an enum, so new codes never break old clients.
    code: z.string(),
    requestId: z.string(),
    errors: z.array(fieldErrorSchema).optional(),
  })
  .meta({ id: 'ApiProblem' });

export type ApiProblem = z.infer<typeof apiProblemSchema>;
