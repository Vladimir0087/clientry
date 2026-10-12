'use client';

import type * as React from 'react';

import { useSession } from '@/entities/session';
import { ConfirmDeleteDialog } from '@/shared/ui/confirm-delete-dialog';
import { canDeleteRecord } from '@clientry/shared/auth';
import type { Task } from '@clientry/shared/tasks';

import { useDeleteTask } from '../model/use-delete-task';

interface DeleteTaskButtonProps {
  readonly task: Pick<Task, 'id' | 'title' | 'createdBy'>;
}

function DeleteTaskDialog({ task }: DeleteTaskButtonProps): React.JSX.Element {
  const deletion = useDeleteTask();
  const handleConfirm = (onError: (error: unknown) => void): void => {
    deletion.mutate(task.id, { onError });
  };
  return (
    <ConfirmDeleteDialog
      name={task.title}
      description="The task disappears from lists. You can undo this right after."
      forbiddenMessage="You can delete only tasks you created."
      deletion={deletion}
      onConfirm={handleConfirm}
    />
  );
}

// Hidden while the session loads and when the role rule would refuse; the API checks it again.
export function DeleteTaskButton({ task }: DeleteTaskButtonProps): React.JSX.Element | null {
  const session = useSession();
  if (session.data === undefined) {
    return null;
  }
  const actor = { userId: session.data.user.id, role: session.data.role };
  return canDeleteRecord(actor, task.createdBy.id) ? <DeleteTaskDialog task={task} /> : null;
}
