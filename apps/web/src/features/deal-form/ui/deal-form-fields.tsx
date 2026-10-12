import type * as React from 'react';
import { Controller } from 'react-hook-form';

import { ClientPicker } from '@/entities/client';
import type { PickedClient } from '@/entities/client';
import { currencyName } from '@/entities/deal';
import { FormField } from '@/shared/ui/form-field';
import { OptionSelect } from '@/shared/ui/option-select';
import type { SelectOption } from '@/shared/ui/option-select';
import { TextField } from '@/shared/ui/text-field';
import { CURRENCIES } from '@clientry/shared/deals';
import type { Currency } from '@clientry/shared/deals';

import type { DealFormApi } from '../model/deal-form-values';

const CURRENCY_OPTIONS: readonly SelectOption[] = CURRENCIES.map((currency) => ({
  value: currency,
  label: `${currency} — ${currencyName(currency)}`,
}));

function toCurrency(value: string): Currency | undefined {
  return CURRENCIES.find((currency) => currency === value);
}

interface FormProps {
  readonly form: DealFormApi;
}

interface ClientFieldProps extends FormProps {
  readonly picked: PickedClient | null;
  readonly onPick: (client: PickedClient) => void;
}

export function ClientField({ form, picked, onPick }: ClientFieldProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name="clientId"
      render={({ field, fieldState }) => (
        <FormField label="Client" error={fieldState.error?.message}>
          {(control) => (
            <ClientPicker
              {...control}
              ref={field.ref}
              value={field.value === '' ? null : picked}
              onChange={(client) => {
                onPick(client);
                field.onChange(client.id);
              }}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )}
    />
  );
}

export function AmountFields({ form }: FormProps): React.JSX.Element {
  const { errors } = form.formState;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
      <TextField
        label="Amount"
        inputMode="decimal"
        autoComplete="off"
        error={errors.amount?.message}
        {...form.register('amount')}
      />
      <Controller
        control={form.control}
        name="currency"
        render={({ field, fieldState }) => (
          <FormField label="Currency" error={fieldState.error?.message}>
            {(control) => (
              <OptionSelect
                {...control}
                ref={field.ref}
                options={CURRENCY_OPTIONS}
                value={field.value}
                onChange={(value) => {
                  field.onChange(toCurrency(value));
                }}
                onBlur={field.onBlur}
                className="w-full"
              />
            )}
          </FormField>
        )}
      />
    </div>
  );
}

interface ChoiceFieldProps extends FormProps {
  readonly name: 'stageId' | 'assigneeId';
  readonly label: string;
  readonly options: readonly SelectOption[];
}

export function ChoiceField({ form, name, label, options }: ChoiceFieldProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} error={fieldState.error?.message}>
          {(control) => (
            <OptionSelect
              {...control}
              ref={field.ref}
              options={options}
              value={field.value === '' ? undefined : field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full sm:w-80"
            />
          )}
        </FormField>
      )}
    />
  );
}
