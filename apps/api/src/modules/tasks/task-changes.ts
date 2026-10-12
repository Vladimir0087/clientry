import type { Task, TaskRelatedRequest, UpdateTaskRequest } from '@clientry/shared/tasks';

function changed<T>(sent: T | undefined, stored: T): T | undefined {
  return sent === stored ? undefined : sent;
}

function isSameRelated(sent: TaskRelatedRequest | null, stored: Task['related']): boolean {
  if (sent === null || stored === null) {
    return sent === stored;
  }
  return sent.kind === stored.kind && sent.id === stored.id;
}

// Instants arrive in the stored toISOString() form, so equal times compare equal as strings.
export function changedFields(task: Task, edit: UpdateTaskRequest): UpdateTaskRequest {
  return {
    title: changed(edit.title, task.title),
    dueAt: changed(edit.dueAt, task.dueAt),
    remindAt: changed(edit.remindAt, task.remindAt),
    assigneeId: changed(edit.assigneeId, task.assignee.id),
    related:
      edit.related === undefined || isSameRelated(edit.related, task.related)
        ? undefined
        : edit.related,
  };
}

export function hasChanges(edit: UpdateTaskRequest): boolean {
  return Object.values<unknown>(edit).some((value) => value !== undefined);
}
