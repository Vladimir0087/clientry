import { z } from 'zod';

// Loose object: RFC 9457 requires clients to ignore unknown extension members, not reject them.
export const problemDetailsSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
