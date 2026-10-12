'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type * as React from 'react';

import { useMembers } from '@/entities/member';
import { TaskNotFound, taskPath, useTask } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { Task } from '@clientry/shared/tasks';
import type { Member } from '@clientry/shared/workspaces';

import { TaskForm } from './task-form';
import type { TaskFormSource } from './task-form';
import { TaskFormSkeleton } from './task-form-skeleton';
import { changedTaskFields, shownInstants, toTaskFormValues } from '../model/task-form-values';
import type { TaskFormOutput, TaskInstants } from '../model/task-form-values';
import { useUpdateTask } from '../model/use-save-task';

function sourceOf(task: Task): TaskFormSource {
  const base = {
    values: toTaskFormValues(task),
    remindAt: shownInstants(task).remindAt,
    reminderSentAt: task.reminderSentAt,
  };
  const { related } = task;
  if (related === null) {
    return { ...base, client: null, linkedDeal: null };
  }
  if (related.kind === 'client') {
    return { ...base, client: { id: related.id, name: related.name }, linkedDeal: null };
  }
  const linkedDeal = { id: related.id, title: related.title, clientId: related.client.id };
  return { ...base, client: related.client, linkedDeal };
}

interface LoadedEditFormProps {
  readonly task: Task;
  readonly members: readonly Member[];
}

function LoadedEditForm({ task, members }: LoadedEditFormProps): React.JSX.Element {
  const router = useRouter();
  const update = useUpdateTask();
  // Changes are worked out against the task the form opened with: a refetch must not turn
  // someone else's newer values into changes of this user.
  const [opened] = useState(task);
  const handleSave = async (values: TaskFormOutput, instants: TaskInstants): Promise<void> => {
    const changes = changedTaskFields(values, instants, opened);
    // Fields typed back to what the task holds leave nothing to send.
    if (Object.keys(changes).length > 0) {
      await update.mutateAsync({ id: opened.id, changes });
    }
    requestHeadingFocus();
    router.replace(taskPath(opened.id));
  };
  return (
    <TaskForm
      source={sourceOf(opened)}
      assigneeOptions={members.map((member) => ({ value: member.id, label: member.name }))}
      submitLabel="Save changes"
      cancelHref={taskPath(opened.id)}
      isEdit
      isSaved={update.isSuccess}
      onSave={handleSave}
    />
  );
}

// A task gone meanwhile swaps the heading Try again focused for the not found state's heading.
function retryTask(task: UseQueryResult<Task>, headingId: string): void {
  void task.refetch().then((result) => {
    if (isNotFound(result.error) && document.activeElement?.id === headingId) {
      requestHeadingFocus();
    }
  });
}

interface EditStateProps {
  readonly id: string;
  readonly headingId: string;
}

function EditState({ id, headingId }: EditStateProps): React.JSX.Element {
  const task = useTask(id);
  const members = useMembers();
  if (task.data !== undefined && members.data !== undefined) {
    return <LoadedEditForm task={task.data} members={members.data.items} />;
  }
  if (task.isPending || members.isPending) {
    return <TaskFormSkeleton />;
  }
  const handleRetry = (): void => {
    if (task.isError) {
      retryTask(task, headingId);
    }
    if (members.isError) {
      void members.refetch();
    }
  };
  return (
    <RetryMessage
      message="We could not load the form."
      focusTargetId={headingId}
      onRetry={handleRetry}
    />
  );
}

// A task that is gone shows the task page's not found state, which brings its own heading.
export function EditTaskForm({ id }: { readonly id: string }): React.JSX.Element {
  const task = useTask(id);
  const headingId = useId();
  if (isNotFound(task.error)) {
    return <TaskNotFound />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeading id={headingId}>Edit task</PageHeading>
      <EditState id={id} headingId={headingId} />
    </div>
  );
}
