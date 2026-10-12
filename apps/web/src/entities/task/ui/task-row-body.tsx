import { cn } from 'cn';
import { BellIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import type { Task } from '@clientry/shared/tasks';

import { OverdueBadge } from './task-badges';
import { taskPath } from '../model/task-path';
import { hasPendingReminder, isDone } from '../model/task-state';

// Every row's title link carries its index, so a caller can move focus to a row after loading more.
export const TASK_LINK_ATTRIBUTE = 'data-task-index';

function DueLine({ task }: { readonly task: Task }): React.JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        <span className="sr-only">Due </span>
        <LocalDate value={task.dueAt} hasTime />
      </span>
      {task.doneAt === null ? (
        <OverdueBadge task={task} />
      ) : (
        <span>
          Done <LocalDate value={task.doneAt} />
        </span>
      )}
    </span>
  );
}

// A done task's reminder never fires, so only an open one shows it.
function ReminderMark({ task }: { readonly task: Task }): React.JSX.Element | null {
  if (task.remindAt === null || isDone(task) || !hasPendingReminder(task)) {
    return null;
  }
  return (
    <span className="inline-flex items-center">
      <BellIcon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">
        Reminder at <LocalDate value={task.remindAt} hasTime />
      </span>
    </span>
  );
}

interface TaskRowBodyProps {
  readonly task: Task;
  readonly index: number;
  readonly isAssigneeShown: boolean;
  // Links to the client or deal, built where those entities are known.
  readonly related?: React.ReactNode;
}

export function TaskRowBody({
  task,
  index,
  isAssigneeShown,
  related,
}: TaskRowBodyProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
      <Link
        href={taskPath(task.id)}
        {...{ [TASK_LINK_ATTRIBUTE]: index }}
        className={cn(
          'w-fit max-w-full rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
          isDone(task) && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <DueLine task={task} />
        <ReminderMark task={task} />
        {isAssigneeShown && (
          <span className="break-words">
            <span className="sr-only">Assigned to </span>
            {task.assignee.name}
          </span>
        )}
        {related}
      </div>
    </div>
  );
}
