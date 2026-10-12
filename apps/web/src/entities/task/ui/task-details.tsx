import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import type { Task } from '@clientry/shared/tasks';

interface DetailProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Detail({ label, children }: DetailProps): React.JSX.Element {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ReminderText({ task }: { readonly task: Task }): React.JSX.Element {
  if (task.remindAt === null) {
    return <span className="text-muted-foreground">No reminder</span>;
  }
  if (task.reminderSentAt !== null) {
    return (
      <span>
        Sent <LocalDate value={task.reminderSentAt} hasTime />
      </span>
    );
  }
  return <LocalDate value={task.remindAt} hasTime />;
}

interface TaskDetailsProps {
  readonly task: Task;
  // The link to the client or deal, built where those entities are known; null for none.
  readonly related: React.ReactNode;
}

export function TaskDetails({ task, related }: TaskDetailsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-3">
        <Detail label="Due">
          <LocalDate value={task.dueAt} hasTime />
        </Detail>
        <Detail label="Reminder">
          <ReminderText task={task} />
        </Detail>
        <Detail label="Assignee">{task.assignee.name}</Detail>
        {related !== null && <Detail label="Related to">{related}</Detail>}
      </dl>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {task.doneAt !== null && (
          <p>
            Completed <LocalDate value={task.doneAt} hasTime />
          </p>
        )}
        <p>
          Added by {task.createdBy.name} on <LocalDate value={task.createdAt} /> · Updated{' '}
          <LocalDate value={task.updatedAt} />
        </p>
      </div>
    </div>
  );
}
