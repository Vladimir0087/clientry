import type { Task } from '@clientry/shared/tasks';

export function isDone(task: Pick<Task, 'doneAt'>): boolean {
  return task.doneAt !== null;
}

// now is null until hydration, so the server HTML never claims a task is overdue.
export function isOverdue(task: Pick<Task, 'doneAt' | 'dueAt'>, now: Date | null): boolean {
  return now !== null && !isDone(task) && Date.parse(task.dueAt) < now.getTime();
}

export function hasPendingReminder(task: Pick<Task, 'remindAt' | 'reminderSentAt'>): boolean {
  return task.remindAt !== null && task.reminderSentAt === null;
}
