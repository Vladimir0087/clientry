'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type * as React from 'react';

import {
  editTaskPath,
  TaskDetails,
  TaskDetailsSkeleton,
  TaskNotFound,
  TASKS_PATH,
  TaskStatusBadge,
  useTask,
} from '@/entities/task';
import { CompleteTaskButton } from '@/features/complete-task';
import { DeleteTaskButton } from '@/features/delete-task';
import { isNotFound } from '@/shared/api/api-status';
import { BackLink } from '@/shared/ui/back-link';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryFocusBox } from '@/shared/ui/retry-focus-box';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { Task } from '@clientry/shared/tasks';

import { TaskRelatedDetail } from '../../../_components/task-related';

function TaskArticle({ task }: { readonly task: Task }): React.JSX.Element {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <PageHeading className="min-w-0 break-words">{task.title}</PageHeading>
          <TaskStatusBadge task={task} />
        </div>
        <div className="flex flex-wrap gap-2">
          <CompleteTaskButton task={task} />
          <Button variant="outline" asChild>
            <Link href={editTaskPath(task.id)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Link>
          </Button>
          <DeleteTaskButton task={task} />
        </div>
      </header>
      <TaskDetails
        task={task}
        related={task.related === null ? null : <TaskRelatedDetail related={task.related} />}
      />
    </article>
  );
}

interface TaskStateProps {
  readonly task: UseQueryResult<Task>;
  readonly focusTargetId: string;
}

function TaskState({ task, focusTargetId }: TaskStateProps): React.JSX.Element {
  // First: a failed refetch keeps the cached task in data, and a deleted one must not show.
  if (isNotFound(task.error)) {
    return <TaskNotFound />;
  }
  if (task.data !== undefined) {
    return <TaskArticle task={task.data} />;
  }
  if (task.isPending) {
    return <TaskDetailsSkeleton />;
  }
  const handleRetry = (): void => {
    void task.refetch();
  };
  return (
    <RetryMessage
      message="We could not load the task."
      focusTargetId={focusTargetId}
      onRetry={handleRetry}
    />
  );
}

export function TaskView({ id }: { readonly id: string }): React.JSX.Element {
  const stateId = useId();
  const task = useTask(id);
  const hasLoaded = task.data !== undefined || isNotFound(task.error);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={TASKS_PATH}>Tasks</BackLink>
      <RetryFocusBox id={stateId} hasLoaded={hasLoaded}>
        <TaskState task={task} focusTargetId={stateId} />
      </RetryFocusBox>
    </div>
  );
}
