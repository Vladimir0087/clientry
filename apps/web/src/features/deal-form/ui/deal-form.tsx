'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';

import type { PickedClient } from '@/entities/client';
import { DEALS_PATH } from '@/entities/deal';
import { hasErrorCode, isNotFound } from '@/shared/api/api-status';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import type { SelectOption } from '@/shared/ui/option-select';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';

import { AmountFields, ChoiceField, ClientField } from './deal-form-fields';
import { DEAL_FIELDS, dealFormSchema } from '../model/deal-form-values';
import type { DealFormApi, DealFormOutput, DealFormValues } from '../model/deal-form-values';

export interface DealFormSource {
  readonly values: DealFormValues;
  readonly client: PickedClient | null;
  // Edit only: the deal version the values come from.
  readonly version?: number;
}

interface DealFormProps<S extends DealFormSource> {
  // On edit the deal as the cache holds it, which may turn newer after the form mounts.
  readonly source: S;
  // Create only: an edit moves the deal through the board, not the form.
  readonly stageOptions?: readonly SelectOption[];
  readonly assigneeOptions: readonly SelectOption[];
  readonly submitLabel: string;
  readonly cancelHref: Route;
  readonly isEdit: boolean;
  readonly isSaved: boolean;
  // shown is the source the values on screen came from.
  readonly onSave: (values: DealFormOutput, form: DealFormApi, shown: S) => Promise<void>;
  readonly onReload?: () => Promise<S | undefined>;
}

const NOT_FOUND_ALERT: FormAlertContent = {
  message: 'This deal no longer exists.',
  link: { href: DEALS_PATH, label: 'Back to deals' },
};

function reloadAlert(message: string, onReload: () => void): FormAlertContent {
  return { message, action: { label: 'Reload', onClick: onReload } };
}

function submitAlert(
  error: unknown,
  form: DealFormApi,
  isEdit: boolean,
  onReload: () => void,
): FormAlertContent | null {
  if (isEdit && hasErrorCode(error, 'DEAL_CHANGED')) {
    return reloadAlert('Someone else changed this deal while you were editing.', onReload);
  }
  if (isEdit && isNotFound(error)) {
    return NOT_FOUND_ALERT;
  }
  return applySubmitError(error, form, DEAL_FIELDS);
}

// Waits for the render that drops the alert, and with it the pressed Reload.
function useTitleFocusAfterReload(form: DealFormApi, alert: FormAlertContent | null): () => void {
  const shouldFocusTitleRef = useRef(false);
  const { setFocus } = form;
  useEffect(() => {
    if (alert === null && shouldFocusTitleRef.current) {
      shouldFocusTitleRef.current = false;
      setFocus('title');
    }
  }, [alert, setFocus]);
  return () => {
    shouldFocusTitleRef.current = true;
  };
}

interface ShownSource<S extends DealFormSource> {
  readonly shown: S;
  readonly picked: PickedClient | null;
  readonly setPicked: (client: PickedClient) => void;
  readonly show: (source: S) => void;
}

function isNewer(source: DealFormSource, shown: DealFormSource): boolean {
  return (
    source.version !== undefined && shown.version !== undefined && source.version > shown.version
  );
}

// Hydration and refetches can bring a newer deal after mount: it replaces an untouched form only,
// so typed changes are never overwritten silently.
function useShownSource<S extends DealFormSource>(form: DealFormApi, source: S): ShownSource<S> {
  const [shown, setShown] = useState(source);
  const [picked, setPicked] = useState(source.client);
  const resetValuesRef = useRef(source.values);
  const show = useCallback((next: S) => {
    setShown(next);
    setPicked(next.client);
  }, []);
  if (!form.formState.isDirty && isNewer(source, shown)) {
    show(source);
  }
  // Field refs are kept, so a focus right after the reset still finds its field.
  const { reset } = form;
  useEffect(() => {
    if (resetValuesRef.current !== shown.values) {
      resetValuesRef.current = shown.values;
      reset(shown.values, { keepFieldsRef: true });
    }
  }, [reset, shown]);
  return { shown, picked, setPicked, show };
}

interface DealSubmit {
  readonly alert: FormAlertContent | null;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}

function useDealSubmit<S extends DealFormSource>(
  form: DealFormApi,
  { shown, show }: Pick<ShownSource<S>, 'shown' | 'show'>,
  { isEdit, onSave, onReload }: Pick<DealFormProps<S>, 'isEdit' | 'onSave' | 'onReload'>,
): DealSubmit {
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const requestTitleFocus = useTitleFocusAfterReload(form, alert);
  const handleReload = async (): Promise<void> => {
    const reloaded = await onReload?.();
    if (reloaded === undefined) {
      setAlert(reloadAlert('Could not reload the deal. Try again.', () => void handleReload()));
      return;
    }
    show(reloaded);
    requestTitleFocus();
    setAlert(null);
  };
  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      await onSave(values, form, shown);
    } catch (error) {
      setAlert(submitAlert(error, form, isEdit, () => void handleReload()));
    }
  });
  return { alert, handleSubmit };
}

interface DealFieldsProps extends Pick<
  DealFormProps<DealFormSource>,
  'stageOptions' | 'assigneeOptions'
> {
  readonly form: DealFormApi;
  readonly picked: PickedClient | null;
  readonly onPick: (client: PickedClient) => void;
}

function DealFields({
  form,
  picked,
  onPick,
  stageOptions,
  assigneeOptions,
}: DealFieldsProps): React.JSX.Element {
  return (
    <FieldGroup>
      <TextField
        label="Title"
        autoComplete="off"
        error={form.formState.errors.title?.message}
        {...form.register('title')}
      />
      <ClientField form={form} picked={picked} onPick={onPick} />
      <AmountFields form={form} />
      {stageOptions !== undefined && (
        <ChoiceField form={form} name="stageId" label="Stage" options={stageOptions} />
      )}
      <ChoiceField form={form} name="assigneeId" label="Assignee" options={assigneeOptions} />
    </FieldGroup>
  );
}

interface FormButtonsProps {
  readonly submitLabel: string;
  readonly cancelHref: Route;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
}

function FormButtons({
  submitLabel,
  cancelHref,
  isBusy,
  isDisabled,
}: FormButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <SubmitButton isSubmitting={isBusy} isDisabled={isDisabled}>
        {submitLabel}
      </SubmitButton>
      <Button variant="outline" size="lg" asChild>
        <Link href={cancelHref}>Cancel</Link>
      </Button>
    </div>
  );
}

export function DealForm<S extends DealFormSource>(props: DealFormProps<S>): React.JSX.Element {
  const form = useForm<DealFormValues, unknown, DealFormOutput>({
    resolver: zodResolver(dealFormSchema),
    mode: 'onTouched',
    defaultValues: props.source.values,
  });
  const { shown, picked, setPicked, show } = useShownSource(form, props.source);
  const { alert, handleSubmit } = useDealSubmit(form, { shown, show }, props);
  const { isSubmitting, isDirty } = form.formState;

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={handleSubmit}
      className="flex max-w-xl flex-col gap-6"
    >
      <FormAlert alert={alert} />
      <DealFields
        form={form}
        picked={picked}
        onPick={setPicked}
        stageOptions={props.stageOptions}
        assigneeOptions={props.assigneeOptions}
      />
      <FormButtons
        submitLabel={props.submitLabel}
        cancelHref={props.cancelHref}
        isBusy={isSubmitting || props.isSaved}
        isDisabled={props.isEdit && !isDirty}
      />
    </form>
  );
}
