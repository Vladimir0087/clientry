'use client';

import type * as React from 'react';

import { isDone } from '@/entities/task';
import { Checkbox } from '@/shared/ui/checkbox';
import type { Task } from '@clientry/shared/tasks';

import { useToggleTask } from '../model/use-toggle-task';

interface CompleteTaskCheckboxProps {
  readonly task: Pick<Task, 'id' | 'title' | 'doneAt'>;
}

// Not disabled while pending: a disabled checkbox would drop its focus, and toggles queue in order.
export function CompleteTaskCheckbox({ task }: CompleteTaskCheckboxProps): React.JSX.Element {
  const toggle = useToggleTask(task.id);
  const isChecked = isDone(task);
  const handleChange = (): void => {
    toggle.mutate({ isDone: !isChecked, previousDoneAt: task.doneAt });
  };
  return (
    <Checkbox
      checked={isChecked}
      aria-label={isChecked ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
      className="mt-0.5"
      onCheckedChange={handleChange}
    />
  );
}
