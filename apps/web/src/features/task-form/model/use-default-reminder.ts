import { useEffect, useState } from 'react';
import { useWatch } from 'react-hook-form';

import { toInstant } from '@/shared/lib/local-date-time';

import { defaultReminder } from './reminder-choice';
import type { TaskFormApi, TaskFormOutput } from './task-form-values';

export interface DefaultReminder {
  // On create, until the user picks a reminder, it follows the due date and time.
  readonly isFollowingDue: boolean;
  readonly handlePick: () => void;
}

// Tracked apart from the dirty state: the form's own setValue is not the user's choice.
export function useDefaultReminder(form: TaskFormApi, now: Date, isEdit: boolean): DefaultReminder {
  const [hasPicked, setHasPicked] = useState(false);
  const isFollowingDue = !isEdit && !hasPicked;
  const [dueDate, dueTime] = useWatch({ control: form.control, name: ['dueDate', 'dueTime'] });
  const reminder = defaultReminder(toInstant(dueDate, dueTime), now);
  useEffect(() => {
    if (isFollowingDue && form.getValues('reminder') !== reminder) {
      form.setValue('reminder', reminder);
    }
  }, [form, isFollowingDue, reminder]);
  return {
    isFollowingDue,
    handlePick: () => {
      setHasPicked(true);
    },
  };
}

// The minute clock can lag the due time, so a reminder that follows it is settled on submit.
export function settleDefaultReminder(form: TaskFormApi, values: TaskFormOutput): TaskFormOutput {
  const reminder = defaultReminder(toInstant(values.dueDate, values.dueTime), new Date());
  form.setValue('reminder', reminder);
  return { ...values, reminder };
}
