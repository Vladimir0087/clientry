import { z } from 'zod';

import { apiProblemSchema } from '../common/api-problem.js';

export const dependencyStatusSchema = z.enum(['up', 'down']);

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const readinessChecksSchema = z.object({
  database: dependencyStatusSchema,
  redis: dependencyStatusSchema,
});

export type ReadinessChecks = z.infer<typeof readinessChecksSchema>;

export const readinessResponseSchema = z.object({
  status: z.literal('ok'),
  checks: readinessChecksSchema,
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const readinessProblemSchema = apiProblemSchema.extend({ checks: readinessChecksSchema });

export type ReadinessProblem = z.infer<typeof readinessProblemSchema>;
