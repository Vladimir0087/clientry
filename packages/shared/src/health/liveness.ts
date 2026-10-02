import { z } from 'zod';

export const livenessResponseSchema = z.object({ status: z.literal('ok') });

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
