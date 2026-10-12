import type * as React from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { formatDateTime, toInstant } from '@/shared/lib/local-date-time';
import { FormField } from '@/shared/ui/form-field';
import { OptionSelect } from '@/shared/ui/option-select';
import type { SelectOption } from '@/shared/ui/option-select';
import { TextField } from '@/shared/ui/text-field';

import { reminderOptions, toReminderChoice } from '../model/reminder-choice';
import type { ReminderChoice } from '../model/reminder-choice';
import { DEFAULT_TIME } from '../model/task-form-values';
import type { TaskFormApi, TaskFormValues } from '../model/task-form-values';

const EARLIEST_DATE = '2000-01-01';
const LATEST_DATE = '2099-12-31';

interface FormProps {
  readonly form: TaskFormApi;
}

type FieldName = keyof TaskFormValues;

interface MomentFieldsProps extends FormProps {
  readonly dateName: 'dueDate' | 'remindDate';
  readonly timeName: 'dueTime' | 'remindTime';
  readonly dateLabel: string;
  readonly timeLabel: string;
  // Fields whose errors a change here can settle, validated again with it.
  readonly dateDeps: readonly FieldName[];
  readonly timeDeps: readonly FieldName[];
}

function MomentFields({
  form,
  dateName,
  timeName,
  dateLabel,
  timeLabel,
  dateDeps,
  timeDeps,
}: MomentFieldsProps): React.JSX.Element {
  const { errors } = form.formState;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={dateLabel}
        type="date"
        min={EARLIEST_DATE}
        max={LATEST_DATE}
        error={errors[dateName]?.message}
        {...form.register(dateName, { deps: [...dateDeps] })}
      />
      <TextField
        label={timeLabel}
        type="time"
        error={errors[timeName]?.message}
        {...form.register(timeName, { deps: [...timeDeps] })}
      />
    </div>
  );
}

// A due change re-validates the reminder, clearing a passed-time error; shortcuts move on submit.
export function DueFields({ form }: FormProps): React.JSX.Element {
  return (
    <MomentFields
      form={form}
      dateName="dueDate"
      timeName="dueTime"
      dateLabel="Due date"
      timeLabel="Due time"
      dateDeps={['reminder']}
      timeDeps={['dueDate', 'reminder']}
    />
  );
}

// A custom time starts at the due date and the default time.
function startCustomTime(form: TaskFormApi): void {
  const { dueDate, remindDate, remindTime } = form.getValues();
  if (remindDate === '') {
    form.setValue('remindDate', dueDate, { shouldDirty: true });
  }
  if (remindTime === '') {
    form.setValue('remindTime', DEFAULT_TIME, { shouldDirty: true });
  }
}

interface ReminderSelectProps extends FormProps {
  readonly options: readonly SelectOption[];
  readonly hint: string | undefined;
  // Opening counts as a pick: Radix reports no change when the shown option is chosen again.
  readonly onOpen: () => void;
  readonly onChoose: (choice: ReminderChoice) => void;
}

function ReminderSelect({
  form,
  options,
  hint,
  onOpen,
  onChoose,
}: ReminderSelectProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name="reminder"
      render={({ field, fieldState }) => (
        <FormField label="Reminder" error={fieldState.error?.message} hint={hint}>
          {(control) => (
            <OptionSelect
              {...control}
              ref={field.ref}
              options={options}
              value={field.value}
              onChange={(value) => {
                const choice = toReminderChoice(value);
                if (choice !== undefined) {
                  onChoose(choice);
                  field.onChange(choice);
                }
              }}
              onOpen={onOpen}
              onBlur={field.onBlur}
              className="w-full sm:w-80"
            />
          )}
        </FormField>
      )}
    />
  );
}

interface ReminderFieldsProps extends FormProps {
  readonly now: Date;
  readonly reminderSentAt: string | null;
  readonly onPick: () => void;
}

export function ReminderFields({
  form,
  now,
  reminderSentAt,
  onPick,
}: ReminderFieldsProps): React.JSX.Element {
  const [dueDate, dueTime, reminder] = useWatch({
    control: form.control,
    name: ['dueDate', 'dueTime', 'reminder'],
  });
  const handleChoose = (choice: ReminderChoice): void => {
    onPick();
    if (choice === 'custom') {
      startCustomTime(form);
    }
  };
  return (
    <>
      <ReminderSelect
        form={form}
        options={reminderOptions(toInstant(dueDate, dueTime), now)}
        hint={reminderSentAt === null ? undefined : `Sent ${formatDateTime(reminderSentAt)}`}
        onOpen={onPick}
        onChoose={handleChoose}
      />
      {reminder === 'custom' && (
        <MomentFields
          form={form}
          dateName="remindDate"
          timeName="remindTime"
          dateLabel="Reminder date"
          timeLabel="Reminder time"
          dateDeps={[]}
          timeDeps={['remindDate']}
        />
      )}
    </>
  );
}

interface AssigneeFieldProps extends FormProps {
  readonly options: readonly SelectOption[];
}

export function AssigneeField({ form, options }: AssigneeFieldProps): React.JSX.Element {
  return (
    <Controller
      control={form.control}
      name="assigneeId"
      render={({ field, fieldState }) => (
        <FormField label="Assignee" error={fieldState.error?.message}>
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
