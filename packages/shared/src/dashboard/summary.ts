import { z } from 'zod';

import { currencyTotalSchema, dealRefSchema } from '../deals/deal-response.js';
import { stageSchema } from '../deals/stage.js';

// Totals per currency are never added up; they follow the order of CURRENCIES.
export const dealTotalsSchema = z
  .object({ count: z.int(), totals: z.array(currencyTotalSchema) })
  .meta({ id: 'DealTotals' });

export type DealTotals = z.infer<typeof dealTotalsSchema>;

export const pipelineStageSchema = dealTotalsSchema
  .extend({ stage: stageSchema })
  .meta({ id: 'PipelineStage' });

export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const memberWorkloadSchema = z
  .object({
    member: dealRefSchema,
    openDeals: dealTotalsSchema,
    openTasks: z.int(),
    overdueTasks: z.int(),
  })
  .meta({ id: 'MemberWorkload' });

export type MemberWorkload = z.infer<typeof memberWorkloadSchema>;

export const dashboardSummaryResponseSchema = z
  .object({
    openDeals: dealTotalsSchema,
    stages: z.array(pipelineStageSchema),
    tasks: z.object({ open: z.int(), overdue: z.int() }),
    members: z.array(memberWorkloadSchema),
  })
  .meta({ id: 'DashboardSummary' });

export type DashboardSummary = z.infer<typeof dashboardSummaryResponseSchema>;
