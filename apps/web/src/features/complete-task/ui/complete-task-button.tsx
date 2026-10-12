'use client';

import { CheckIcon, RotateCcwIcon } from 'lucide-react';
import type * as React from 'react';

import { isDone } from '@/entities/task';
import { Button } from '@/shared/ui/button';
import type { Task } from '@clientry/shared/tasks';

import { useToggleTask } from '../model/use-toggle-task';

interface CompleteTaskButtonProps {
  readonly task: Pick<Task, 'id' | 'doneAt'>;
}

export function CompleteTaskButton({ task }: CompleteTaskButtonProps): React.JSX.Element {
  const toggle = useToggleTask(task.id);
  const isCompleted = isDone(task);
  const handleClick = (): void => {
    toggle.mutate({ isDone: !isCompleted, previousDoneAt: task.doneAt });
  };
  return (
    <Button variant="outline" onClick={handleClick}>
      {isCompleted ? <RotateCcwIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
      {isCompleted ? 'Reopen' : 'Mark as done'}
    </Button>
  );
}
