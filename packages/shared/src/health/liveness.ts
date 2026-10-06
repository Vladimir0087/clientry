import { z } from 'zod';

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
