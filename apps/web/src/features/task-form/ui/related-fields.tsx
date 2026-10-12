'use client';

import type * as React from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { ControllerRenderProps } from 'react-hook-form';

import { ClientPicker } from '@/entities/client';
import type { PickedClient } from '@/entities/client';
import { useClientDeals } from '@/entities/deal';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import type { FieldControlProps } from '@/shared/ui/form-field';
import { OptionSelect } from '@/shared/ui/option-select';
import type { SelectOption } from '@/shared/ui/option-select';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { DealListResponse } from '@clientry/shared/deals';

import type { TaskFormApi, TaskFormValues } from '../model/task-form-values';

// Select items cannot hold an empty value, so "No deal" has its own.
const NO_DEAL = 'none';
const NO_DEAL_OPTION: SelectOption = { value: NO_DEAL, label: 'No deal' };

export interface LinkedDeal {
  readonly id: string;
  readonly title: string;
  readonly clientId: string;
}

interface ClientFieldProps {
  readonly form: TaskFormApi;
  readonly picked: PickedClient | null;
  readonly onPick: (client: PickedClient | null) => void;
}

type ClientIdField = ControllerRenderProps<TaskFormValues, 'clientId'>;

interface ClientHandlers {
  readonly handleChange: (client: PickedClient) => void;
  readonly handleRemove: () => void;
}

function clientHandlers(
  { form, onPick }: Omit<ClientFieldProps, 'picked'>,
  field: ClientIdField,
): ClientHandlers {
  // Another client's deals do not fit, so Deal goes back to "No deal".
  const handleClearDeal = (): void => {
    form.setValue('dealId', '', { shouldDirty: true });
  };
  return {
    handleChange: (client) => {
      if (client.id !== field.value) {
        handleClearDeal();
      }
      onPick(client);
      field.onChange(client.id);
    },
    handleRemove: () => {
      handleClearDeal();
      onPick(null);
      field.onChange('');
      // The button leaves with the client, so the picker takes its focus.
      form.setFocus('clientId');
    },
  };
}

interface ClientControlProps extends FieldControlProps {
  readonly clientId: string;
  readonly picked: PickedClient | null;
  readonly ref: React.Ref<HTMLButtonElement>;
  readonly onBlur: () => void;
  readonly onChange: (client: PickedClient) => void;
  readonly onRemove: () => void;
}

function ClientControl({
  clientId,
  picked,
  onRemove,
  ...picker
}: ClientControlProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ClientPicker {...picker} value={clientId === '' ? null : picked} />
      {clientId !== '' && (
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove client
        </Button>
      )}
    </div>
  );
}

function ClientField({ form, picked, onPick }: ClientFieldProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name="clientId"
      render={({ field, fieldState }) => {
        const { handleChange, handleRemove } = clientHandlers({ form, onPick }, field);
        return (
          <FormField label="Client" error={fieldState.error?.message}>
            {(control) => (
              <ClientControl
                {...control}
                ref={field.ref}
                clientId={field.value}
                picked={picked}
                onBlur={field.onBlur}
                onChange={handleChange}
                onRemove={handleRemove}
              />
            )}
          </FormField>
        );
      }}
    />
  );
}

interface DealSelectProps extends FieldControlProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly isDisabled: boolean;
  readonly onChange: (dealId: string) => void;
  readonly onBlur: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
}

function DealSelect({ value, onChange, ...select }: DealSelectProps): React.JSX.Element {
  return (
    <OptionSelect
      {...select}
      value={value === '' ? NO_DEAL : value}
      onChange={(next) => {
        onChange(next === NO_DEAL ? '' : next);
      }}
      className="w-full sm:w-80"
    />
  );
}

interface DealControlProps {
  readonly form: TaskFormApi;
  readonly options: readonly SelectOption[];
  readonly isDisabled: boolean;
  readonly hint?: string;
  readonly children?: React.ReactNode;
}

function DealControl({
  form,
  options,
  isDisabled,
  hint,
  children,
}: DealControlProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name="dealId"
      render={({ field, fieldState }) => (
        <FormField label="Deal" error={fieldState.error?.message} hint={hint}>
          {(control) => (
            <>
              <DealSelect
                {...control}
                ref={field.ref}
                value={field.value}
                options={options}
                isDisabled={isDisabled}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
              {children}
            </>
          )}
        </FormField>
      )}
    />
  );
}

// The 50 newest deals of the client, and the linked deal when they lack it.
function dealOptions(
  deals: DealListResponse['items'],
  clientId: string,
  linkedDeal: LinkedDeal | null,
): SelectOption[] {
  const options = [NO_DEAL_OPTION, ...deals.map((deal) => ({ value: deal.id, label: deal.title }))];
  if (
    linkedDeal !== null &&
    linkedDeal.clientId === clientId &&
    !deals.some((deal) => deal.id === linkedDeal.id)
  ) {
    options.push({ value: linkedDeal.id, label: linkedDeal.title });
  }
  return options;
}

interface ClientDealFieldProps {
  readonly form: TaskFormApi;
  readonly clientId: string;
  readonly linkedDeal: LinkedDeal | null;
}

function ClientDealField({ form, clientId, linkedDeal }: ClientDealFieldProps): React.JSX.Element {
  const deals = useClientDeals(clientId);
  const options = dealOptions(deals.data?.items ?? [], clientId, linkedDeal);
  if (deals.data !== undefined) {
    return <DealControl form={form} options={options} isDisabled={false} />;
  }
  if (deals.isPending) {
    return <DealControl form={form} options={options} isDisabled hint="Loading deals…" />;
  }
  // The select stays disabled while the deals load again, so the client picker takes the focus.
  const handleRetry = (): void => {
    form.setFocus('clientId');
    void deals.refetch();
  };
  return (
    <DealControl form={form} options={options} isDisabled>
      <RetryMessage
        message="We could not load the client's deals."
        focusTargetId={null}
        onRetry={handleRetry}
      />
    </DealControl>
  );
}

interface DealFieldProps {
  readonly form: TaskFormApi;
  readonly linkedDeal: LinkedDeal | null;
}

function DealField({ form, linkedDeal }: DealFieldProps): React.JSX.Element {
  const clientId = useWatch({ control: form.control, name: 'clientId' });
  return clientId === '' ? (
    <DealControl form={form} options={[NO_DEAL_OPTION]} isDisabled />
  ) : (
    <ClientDealField form={form} clientId={clientId} linkedDeal={linkedDeal} />
  );
}

interface RelatedFieldsProps extends ClientFieldProps {
  readonly linkedDeal: LinkedDeal | null;
}

export function RelatedFields({
  form,
  picked,
  onPick,
  linkedDeal,
}: RelatedFieldsProps): React.JSX.Element {
  return (
    <>
      <ClientField form={form} picked={picked} onPick={onPick} />
      <DealField form={form} linkedDeal={linkedDeal} />
    </>
  );
}
