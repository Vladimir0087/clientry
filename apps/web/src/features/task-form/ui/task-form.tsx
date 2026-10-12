'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import type * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { PickedClient } from '@/entities/client';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { useNow } from '@/shared/lib/use-now';
import { Button } from '@/shared/ui/button';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import type { SelectOption } from '@/shared/ui/option-select';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';

import { RelatedFields } from './related-fields';
import type { LinkedDeal } from './related-fields';
import { AssigneeField, DueFields, ReminderFields } from './task-form-fields';
import { TaskFormSkeleton } from './task-form-skeleton';
import { hasSendableChanges, taskFormSchema, toTaskInstants } from '../model/task-form-values';
import type {
  TaskFormApi,
  TaskFormOutput,
  TaskFormValues,
  TaskInstants,
} from '../model/task-form-values';
import { reminderField, taskSubmitAlert } from '../model/task-submit-error';
import { settleDefaultReminder, useDefaultReminder } from '../model/use-default-reminder';

export interface TaskFormSource {
  readonly values: TaskFormValues;
  readonly client: PickedClient | null;
  readonly linkedDeal: LinkedDeal | null;
  // Edit only: an unchanged reminder may lie in the past; a sent one shows when it went out.
  readonly remindAt: string | null;
  readonly reminderSentAt: string | null;
}

interface TaskFormProps {
  readonly source: TaskFormSource;
  readonly assigneeOptions: readonly SelectOption[];
  readonly submitLabel: string;
  readonly cancelHref: Route;
  readonly isEdit: boolean;
  readonly isSaved: boolean;
  readonly onSave: (values: TaskFormOutput, instants: TaskInstants) => Promise<void>;
}

// Checked at submit with the current time: a shortcut can pass while the form is open.
function isPastReminder(instants: TaskInstants, storedRemindAt: string | null): boolean {
  return (
    instants.remindAt !== null &&
    instants.remindAt !== storedRemindAt &&
    Date.parse(instants.remindAt) <= Date.now()
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

interface TaskSubmit {
  readonly alert: FormAlertContent | null;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}

function useTaskSubmit(
  form: TaskFormApi,
  { source, isEdit, onSave }: Pick<TaskFormProps, 'source' | 'isEdit' | 'onSave'>,
  isReminderFollowingDue: boolean,
): TaskSubmit {
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const handleSubmit = form.handleSubmit(async (parsed) => {
    setAlert(null);
    const values = isReminderFollowingDue ? settleDefaultReminder(form, parsed) : parsed;
    const instants = toTaskInstants(values);
    if (instants === null) {
      return;
    }
    if (isPastReminder(instants, source.remindAt)) {
      form.setError(
        reminderField(values),
        { type: 'validate', message: 'Choose a time in the future' },
        { shouldFocus: true },
      );
      return;
    }
    try {
      await onSave(values, instants);
    } catch (error) {
      setAlert(taskSubmitAlert(error, form, values, isEdit));
    }
  });
  return { alert, handleSubmit };
}

// Edit only: a form showing what the task holds has nothing to save.
function useHasChanges(form: TaskFormApi): boolean {
  const reminder = useWatch({ control: form.control, name: 'reminder' });
  return hasSendableChanges(form.formState.dirtyFields, reminder);
}

interface TaskFieldsProps {
  readonly form: TaskFormApi;
  readonly now: Date;
  readonly source: TaskFormSource;
  readonly assigneeOptions: readonly SelectOption[];
  readonly onReminderPick: () => void;
}

function TaskFields({
  form,
  now,
  source,
  assigneeOptions,
  onReminderPick,
}: TaskFieldsProps): React.JSX.Element {
  const [picked, setPicked] = useState(source.client);
  return (
    <FieldGroup>
      <TextField
        label="Title"
        autoComplete="off"
        error={form.formState.errors.title?.message}
        {...form.register('title')}
      />
      <DueFields form={form} />
      <ReminderFields
        form={form}
        now={now}
        reminderSentAt={source.reminderSentAt}
        onPick={onReminderPick}
      />
      <AssigneeField form={form} options={assigneeOptions} />
      <RelatedFields
        form={form}
        picked={picked}
        onPick={setPicked}
        linkedDeal={source.linkedDeal}
      />
    </FieldGroup>
  );
}

function LoadedTaskForm({
  now,
  ...props
}: TaskFormProps & { readonly now: Date }): React.JSX.Element {
  const form = useForm<TaskFormValues, unknown, TaskFormOutput>({
    resolver: zodResolver(taskFormSchema),
    mode: 'onTouched',
    defaultValues: props.source.values,
  });
  const reminder = useDefaultReminder(form, now, props.isEdit);
  const { alert, handleSubmit } = useTaskSubmit(form, props, reminder.isFollowingDue);
  const hasChanges = useHasChanges(form);
  const { isSubmitting } = form.formState;

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={handleSubmit}
      className="flex max-w-xl flex-col gap-6"
    >
      <FormAlert alert={alert} />
      <TaskFields
        form={form}
        now={now}
        source={props.source}
        assigneeOptions={props.assigneeOptions}
        onReminderPick={reminder.handlePick}
      />
      <FormButtons
        submitLabel={props.submitLabel}
        cancelHref={props.cancelHref}
        isBusy={isSubmitting || props.isSaved}
        isDisabled={props.isEdit && !hasChanges}
      />
    </form>
  );
}

// Values come from instants in the reader's zone, which the server does not know: the form
// renders in the browser only, after hydration.
export function TaskForm(props: TaskFormProps): React.JSX.Element {
  const now = useNow();
  return now === null ? <TaskFormSkeleton /> : <LoadedTaskForm {...props} now={now} />;
}
