'use client';

import type * as React from 'react';

import { useNow } from '@/shared/lib/use-now';
import { Badge } from '@/shared/ui/badge';
import type { Task } from '@clientry/shared/tasks';

import { isDone, isOverdue } from '../model/task-state';

type BadgeTask = Pick<Task, 'doneAt' | 'dueAt'>;

export function OverdueBadge({ task }: { readonly task: BadgeTask }): React.JSX.Element | null {
  const now = useNow();
  return isOverdue(task, now) ? <Badge variant="danger">Overdue</Badge> : null;
}

// "Done" for a completed task, "Overdue" for an open one past due.
export function TaskStatusBadge({ task }: { readonly task: BadgeTask }): React.JSX.Element | null {
  return isDone(task) ? <Badge variant="success">Done</Badge> : <OverdueBadge task={task} />;
}
