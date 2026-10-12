'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';

import { CLIENTS_PATH } from '@/entities/client';
import { isNotFound } from '@/shared/api/api-status';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { Textarea } from '@/shared/ui/textarea';
import { createClientRequestSchema } from '@clientry/shared/clients';

import { SourceField, TagsField } from './client-form-fields';
import { CLIENT_FIELDS } from '../model/client-form-values';
import type { ClientFormValues } from '../model/client-form-values';

type ClientFormApi = UseFormReturn<ClientFormValues>;

export interface ClientFormProps {
  readonly defaultValues: ClientFormValues;
  readonly submitLabel: string;
  readonly cancelHref: Route;
  // Edit: "Save changes" waits for a change, and a 404 means the client is gone.
  readonly isEdit: boolean;
  readonly isSaved: boolean;
  readonly onSave: (values: ClientFormValues, form: ClientFormApi) => Promise<void>;
}

function toAlert(error: unknown, form: ClientFormApi, isEdit: boolean): FormAlertContent | null {
  if (isEdit && isNotFound(error)) {
    return {
      message: 'This client no longer exists.',
      link: { href: CLIENTS_PATH, label: 'Back to clients' },
    };
  }
  return applySubmitError(error, form, CLIENT_FIELDS);
}

function ClientFields({ form }: { readonly form: ClientFormApi }): React.JSX.Element {
  const { errors } = form.formState;
  return (
    <FieldGroup>
      <TextField
        label="Name"
        autoComplete="off"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <TextField
        label="Company"
        autoComplete="organization"
        error={errors.company?.message}
        {...form.register('company')}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...form.register('email')}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...form.register('phone')}
      />
      <SourceField control={form.control} errors={errors} />
      <TagsField control={form.control} errors={errors} />
      <FormField label="Notes" error={errors.notes?.message}>
        {(control) => (
          <Textarea {...control} autoComplete="off" rows={5} {...form.register('notes')} />
        )}
      </FormField>
    </FieldGroup>
  );
}

export function ClientForm({
  defaultValues,
  submitLabel,
  cancelHref,
  isEdit,
  isSaved,
  onSave,
}: ClientFormProps): React.JSX.Element {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(createClientRequestSchema),
    mode: 'onTouched',
    defaultValues,
  });
  const { isSubmitting, isDirty } = form.formState;
  const [alert, setAlert] = useState<FormAlertContent | null>(null);

  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      await onSave(values, form);
    } catch (error) {
      setAlert(toAlert(error, form, isEdit));
    }
  });

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      <FormAlert alert={alert} />
      <ClientFields form={form} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton isSubmitting={isSubmitting || isSaved} isDisabled={isEdit && !isDirty}>
          {submitLabel}
        </SubmitButton>
        <Button variant="outline" size="lg" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
