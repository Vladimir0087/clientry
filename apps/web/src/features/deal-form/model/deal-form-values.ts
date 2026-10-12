import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { createDealRequestSchema, updateDealRequestSchema } from '@clientry/shared/deals';
import type { Deal, UpdateDealRequest } from '@clientry/shared/deals';

import { amountInputSchema, formatAmountInput } from './amount-input';

// Money is typed with separators and decimals, so the amount is the one text field.
export const dealFormSchema = createDealRequestSchema.extend({ amount: amountInputSchema });

export type DealFormValues = z.input<typeof dealFormSchema>;
export type DealFormOutput = z.output<typeof dealFormSchema>;
export type DealFormApi = UseFormReturn<DealFormValues, unknown, DealFormOutput>;

export const DEAL_FIELDS = [
  'title',
  'clientId',
  'stageId',
  'amount',
  'currency',
  'assigneeId',
] as const satisfies readonly (keyof DealFormValues)[];

// The stage changes only through a move, so an edit never sends it.
const EDITABLE_FIELDS = [
  'title',
  'clientId',
  'amount',
  'currency',
  'assigneeId',
] as const satisfies readonly (keyof DealFormValues)[];

interface DealFormDefaults {
  readonly stageId: string;
  readonly assigneeId: string;
  readonly clientId?: string;
}

export function emptyDealValues({
  stageId,
  assigneeId,
  clientId,
}: DealFormDefaults): DealFormValues {
  return {
    title: '',
    clientId: clientId ?? '',
    stageId,
    amount: '',
    currency: 'USD',
    assigneeId,
  };
}

export function toDealFormValues(deal: Deal): DealFormValues {
  return {
    title: deal.title,
    clientId: deal.client.id,
    stageId: deal.stage.id,
    amount: formatAmountInput(deal.amount),
    currency: deal.currency,
    assigneeId: deal.assignee.id,
  };
}

// Only what the user changed is sent, with the version the form was loaded from.
export function changedDealFields(
  values: DealFormOutput,
  dirtyFields: Partial<Readonly<Record<keyof DealFormValues, boolean | undefined>>>,
  version: number,
): UpdateDealRequest {
  const changed = EDITABLE_FIELDS.filter((field) => dirtyFields[field] === true);
  return updateDealRequestSchema.parse({
    version,
    ...Object.fromEntries(changed.map((field) => [field, values[field]])),
  });
}
